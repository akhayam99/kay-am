import { useEffect, useMemo, useRef, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { AgentId, ProjectId, SessionId, WorktreeStatus } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { distanceBehind } from '../../../../shared/lib/gitStatus';
import type { SessionCreationId } from '../../../../store/slices/session-view';
import { useToast } from '../../../../app/components/Toast';
import { taskModelAgentSpawnConfig } from '../../components/AgentSpawnConfig/taskModelAgentSpawnConfig';

type Params = {
  readonly sessionId: SessionId | null;
  readonly status: WorktreeStatus | null;
  readonly onError?: (message: string) => void;
};

type RunParams = {
  readonly projectId?: ProjectId;
};

type Result = {
  readonly canRebase: boolean;
  readonly isRunning: boolean;
  readonly error: string | null;
  readonly run: (params?: RunParams) => Promise<void>;
};

type Pending = {
  readonly agentId: AgentId;
  readonly creationId: SessionCreationId;
};

type RebaseTarget = {
  readonly projectId: ProjectId | null;
  readonly projectName: string | null;
  readonly baseBranch: string;
  readonly worktreePath: string | null;
};

const REBASE_AGENT_PREFIX = 'Rebase on ';

const rebasePromptFor = ({ baseBranch }: { readonly baseBranch: string }): string =>
  [
    `Rebase this session branch onto origin/${baseBranch}.`,
    `- Fetch origin ${baseBranch} before rebasing.`,
    `- Rebase the session branch onto origin/${baseBranch} and resolve conflicts by favoring the branch's intent.`,
    "- Run the repository's typecheck to confirm nothing broke.",
    '- Push the rebased branch with "$GOODBOY_BIN" query github push --force-with-lease; fall back to git push --force-with-lease only if the bridge is unavailable.',
    '- Never merge and never touch other branches.',
    '- If a conflict cannot be resolved confidently, stop and report the conflicting files.',
  ].join('\n');

export const useRebaseAgent = ({ sessionId, status, onError }: Params): Result => {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const settledAgentIds = useRef(new Set<AgentId>());
  const pendingRef = useRef<Pending | null>(null);
  const session = useAppStore((state) =>
    sessionId == null
      ? null
      : (state.sessions.find((candidate) => candidate.id === sessionId) ?? null),
  );
  const workspaceOverrides = useAppStore((state) =>
    session == null ? null : (state.workspaceOverrides?.[session.workspaceId] ?? null),
  );
  const mounts = useAppStore((state) =>
    sessionId == null ? null : (state.sessionProjectMounts[sessionId] ?? null),
  );
  const projects = useAppStore((state) => state.projects);
  const activeProjectId = session?.activeProjectId ?? mounts?.[0]?.projectId ?? null;
  const targetFor = ({ projectId }: { readonly projectId: ProjectId | null }): RebaseTarget => {
    const project = projects.find((candidate) => candidate.id === projectId) ?? null;
    const mount = mounts?.find((candidate) => candidate.projectId === projectId) ?? null;
    return {
      projectId,
      projectName: project?.name ?? mount?.mountName ?? null,
      baseBranch: project?.baseBranch ?? 'main',
      worktreePath: mount?.worktreePath ?? null,
    };
  };
  const baseBranch = targetFor({ projectId: activeProjectId }).baseBranch;
  const phaseRuns = useAppStore((state) =>
    sessionId == null ? null : (state.sessionPhaseRuns[sessionId] ?? null),
  );
  const spawnAgent = useAppStore((state) => state.spawnAgent);
  const selectAgent = useAppStore((state) => state.selectAgent);
  const setActiveLens = useAppStore((state) => state.setActiveLens);
  const beginSessionCreation = useAppStore((state) => state.beginSessionCreation);
  const endSessionCreation = useAppStore((state) => state.endSessionCreation);
  const recordSessionEvent = useAppStore((state) => state.recordSessionEvent);
  const { showToast } = useToast();
  const config = useMemo(
    () =>
      taskModelAgentSpawnConfig({
        task: 'rebase',
        preferences: workspaceOverrides?.taskModels,
        workspaceDefaultProviderId: workspaceOverrides?.defaultProviderId,
        sessionDefaultProviderId: session?.providerPreference.defaultProvider ?? 'anthropic',
      }),
    [session?.providerPreference.defaultProvider, workspaceOverrides],
  );
  const isAgentRunning =
    phaseRuns?.some(
      (agent) =>
        agent.name.startsWith(REBASE_AGENT_PREFIX) &&
        (agent.status === 'pending' || agent.status === 'running'),
    ) === true;
  const isRunning = isStarting || isAgentRunning;
  const behindMain = status != null ? distanceBehind({ distance: status.mainDistance }) : null;
  const canRebase = sessionId != null && behindMain != null && behindMain > 0;

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(
    () => () => {
      const leftOver = pendingRef.current;
      if (sessionId == null || leftOver == null) {
        return;
      }
      pendingRef.current = null;
      endSessionCreation(sessionId, leftOver.creationId);
    },
    [endSessionCreation, sessionId],
  );

  useEffect(() => {
    if (sessionId == null || pending == null) {
      return;
    }
    const agent = phaseRuns?.find((candidate) => candidate.id === pending.agentId) ?? null;
    if (agent == null || (agent.status !== 'completed' && agent.status !== 'failed')) {
      return;
    }
    if (settledAgentIds.current.has(pending.agentId)) {
      return;
    }
    settledAgentIds.current.add(pending.agentId);
    const agentId = pending.agentId;
    const isFailed = agent.status === 'failed';
    endSessionCreation(sessionId, pending.creationId);
    setPending(null);
    showToast(
      isFailed ? 'error' : 'success',
      isFailed
        ? 'The rebase agent stopped before finishing.'
        : `This branch is rebased on ${baseBranch}.`,
      {
        title: isFailed ? 'Rebase failed' : 'Rebase done',
        action: {
          label: 'Open the rebase agent',
          onClick: () => {
            setActiveLens(sessionId, 'agents');
            void selectAgent(sessionId, agentId);
          },
        },
      },
    );
  }, [
    baseBranch,
    endSessionCreation,
    pending,
    phaseRuns,
    selectAgent,
    sessionId,
    setActiveLens,
    showToast,
  ]);

  const run = async (params?: RunParams): Promise<void> => {
    if (!canRebase || isRunning || sessionId == null || config.provider === '') {
      return;
    }
    const target = targetFor({ projectId: params?.projectId ?? activeProjectId });
    setError(null);
    setIsStarting(true);
    const creationId = beginSessionCreation(sessionId, {
      kind: 'branch',
      label: `Rebasing on ${target.baseBranch}`,
    });
    try {
      const agentId = await spawnAgent(sessionId, {
        name: `${REBASE_AGENT_PREFIX}${target.baseBranch}`,
        initialPrompt: rebasePromptFor({ baseBranch: target.baseBranch }),
        model: config.model,
        provider: config.provider,
        effort: config.effort,
        focus: 'none',
      });
      setPending({ agentId, creationId });
      void recordSessionEvent({
        sessionId,
        kind: 'rebase_requested',
        payload: {
          ...(target.projectId == null ? {} : { projectId: target.projectId }),
          ...(target.projectName == null ? {} : { projectName: target.projectName }),
          ...(target.worktreePath == null ? {} : { worktreePath: target.worktreePath }),
          ...(behindMain == null ? {} : { behind: behindMain }),
          branch: target.baseBranch,
          agentId,
        },
      });
      showToast(
        'info',
        `An agent is rebasing this branch on ${target.baseBranch}. You can keep working.`,
        {
          title: 'Rebase started',
          action: {
            label: 'Open the rebase agent',
            onClick: () => {
              setActiveLens(sessionId, 'agents');
              void selectAgent(sessionId, agentId);
            },
          },
        },
      );
    } catch (failure) {
      endSessionCreation(sessionId, creationId);
      const message = formatError(failure);
      setError(message);
      onError?.(message);
    } finally {
      setIsStarting(false);
    }
  };

  return { canRebase, isRunning, error, run };
};
