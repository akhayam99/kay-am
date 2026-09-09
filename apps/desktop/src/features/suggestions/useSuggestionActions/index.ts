import { useMemo } from 'react';
import { formatError } from '@goodboy/ui';
import type { Agent, ResolveThread, Session, SessionProjectMount } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../store';
import { distanceBehind } from '../../../shared/lib/gitStatus';
import { useSessionRoleModels } from '../../../shared/hooks/useSessionRoleModels';
import type { ResolveModelChoice } from '../../chat/spawn-from-comment';
import { contextWindowFor } from '../../session/contextWindowFor';
import { startFixAttempt } from '../../review/startFixAttempt';
import { kindRouting } from '../../session/agent-kind';
import { useRebaseAgent } from '../../session/hooks/useRebaseAgent';
import { useWorktreeStatuses } from '../../session/hooks/useWorktreeStatuses';
import { useAdvanceWorkflowAgent } from '../../workflows/useAdvanceWorkflowAgent';
import { eligibleReviewThreads } from '../eligibleThreads';
import { useMountProposalActions } from '../useMountProposalActions';
import type { SessionSuggestion } from '../types';

type Params = {
  readonly session: Session;
  readonly agents: ReadonlyArray<Agent>;
  readonly onSelectQuestions: () => void;
};

export type SuggestionAction = {
  readonly label: string;
  readonly isDisabled: boolean;
  readonly onAct: () => void;
};

export type SuggestionActions = {
  readonly primary: SuggestionAction | null;
  readonly onDismiss: (() => void) | null;
};

export type SuggestionActionResolver = (params: {
  readonly suggestion: SessionSuggestion;
}) => SuggestionActions;

const NO_ACTIONS: SuggestionActions = { primary: null, onDismiss: null };
const EMPTY_ROWS: ReadonlyArray<ResolveThread> = [];

export const useSuggestionActions = ({
  session,
  agents,
  onSelectQuestions,
}: Params): SuggestionActionResolver => {
  const sessionId = session.id;
  const github = useAppStore((state) => state.sessionGithub[sessionId] ?? null);
  const mounts = useAppStore(
    (state) =>
      state.sessionProjectMounts[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<SessionProjectMount>),
  );
  const projects = useAppStore((state) => state.projects);
  const emitNotification = useAppStore((state) => state.emitNotification);
  const setSessionActiveProject = useAppStore((state) => state.setSessionActiveProject);
  const roleModels = useSessionRoleModels({ sessionId });
  const spawnAgent = useAppStore((state) => state.spawnAgent);
  const setAgentConfig = useAppStore((state) => state.setAgentConfig);
  const rows = useAppStore((state) => state.sessionResolveThreads[sessionId] ?? EMPTY_ROWS);
  const setActiveLens = useAppStore((state) => state.setActiveLens);
  const advanceAgent = useAdvanceWorkflowAgent({ sessionId });
  const proposalActions = useMountProposalActions({ sessionId });

  const reportError = (title: string) => (message: string) => {
    void emitNotification('error', 'error', title, formatError(message), { sessionId });
  };

  const targets = useMemo(
    () =>
      mounts.map((mount) => ({
        worktreePath: mount.worktreePath,
        baseBranch:
          projects.find((project) => project.id === mount.projectId)?.baseBranch ?? undefined,
      })),
    [projects, mounts],
  );
  const statuses = useWorktreeStatuses({ targets });
  const behindStatus = useMemo(() => {
    for (const mount of mounts) {
      const status = statuses.get(mount.worktreePath) ?? null;
      const behind = status == null ? null : distanceBehind({ distance: status.mainDistance });
      if (behind != null && behind > 0) {
        return status;
      }
    }
    return null;
  }, [mounts, statuses]);
  const rebase = useRebaseAgent({
    sessionId,
    status: behindStatus,
    onError: reportError('Rebase failed'),
  });

  const unresolvedThreads = useMemo(() => eligibleReviewThreads({ github, rows }), [github, rows]);

  const pullRequest = github?.pr ?? null;
  const startResolving = () => {
    if (pullRequest == null || unresolvedThreads.length === 0) {
      return;
    }
    const routing = kindRouting({ kind: 'resolver', roleModels });
    const choice: ResolveModelChoice = {
      provider: routing.provider,
      model: routing.model,
      effort: routing.effort,
    };
    void startFixAttempt({
      sessionId,
      threads: unresolvedThreads,
      pr: pullRequest,
      choice,
      mode: 'shared',
      contextWindow: contextWindowFor(routing.model),
      spawnAgent,
      setAgentConfig,
    })
      .then(() => setActiveLens(sessionId, 'review'))
      .catch((error: unknown) => {
        reportError('Fix failed to start')(formatError(error));
      });
  };

  const startRebase = ({
    suggestion,
  }: {
    readonly suggestion: Extract<SessionSuggestion, { readonly kind: 'rebase-project' }>;
  }) => {
    void (async () => {
      await setSessionActiveProject({
        sessionId,
        projectId: suggestion.payload.projectId,
      });
      await rebase.run({ projectId: suggestion.payload.projectId });
    })().catch((error: unknown) => {
      reportError('Rebase failed')(formatError(error));
    });
  };

  const startWorkflowStep = ({
    suggestion,
  }: {
    readonly suggestion: Extract<SessionSuggestion, { readonly kind: 'workflow-next-step' }>;
  }) => {
    const next =
      agents.find(
        (agent) =>
          agent.workflowRunId === suggestion.payload.runId &&
          agent.stepId === suggestion.payload.stepId &&
          agent.status === 'pending',
      ) ?? null;
    void advanceAgent({ agent: next });
  };

  const proposalTarget = ({
    suggestion,
  }: {
    readonly suggestion: Extract<SessionSuggestion, { readonly kind: 'mount-project' }>;
  }) => ({
    projectId: suggestion.payload.projectId,
    projectName: suggestion.payload.projectName,
    reason: suggestion.payload.reason,
  });

  return ({ suggestion }) => {
    if (suggestion.kind === 'workflow-next-step') {
      return {
        primary: {
          label: 'Continue',
          isDisabled: false,
          onAct: () => startWorkflowStep({ suggestion }),
        },
        onDismiss: null,
      };
    }
    if (suggestion.kind === 'resolve-threads') {
      return {
        primary: { label: 'Fix all', isDisabled: false, onAct: startResolving },
        onDismiss: null,
      };
    }
    if (suggestion.kind === 'rebase-project') {
      return {
        primary: {
          label: rebase.isRunning ? 'Rebasing' : 'Rebase',
          isDisabled: !rebase.canRebase || rebase.isRunning,
          onAct: () => startRebase({ suggestion }),
        },
        onDismiss: null,
      };
    }
    if (suggestion.kind === 'answer-questions') {
      return {
        primary: { label: 'Answer', isDisabled: false, onAct: onSelectQuestions },
        onDismiss: null,
      };
    }
    if (suggestion.kind === 'mount-project') {
      return {
        primary: {
          label: 'Mount project',
          isDisabled: false,
          onAct: () => proposalActions.mount(proposalTarget({ suggestion })),
        },
        onDismiss: () => proposalActions.dismiss(proposalTarget({ suggestion })),
      };
    }
    return NO_ACTIONS;
  };
};
