import { useEffect, useMemo, useState } from 'react';
import { Check, MessageSquare, SkipForward, type LucideIcon } from 'lucide-react';
import { formatError, type Tone } from '@goodboy/ui';
import type {
  Agent,
  OpenQuestion,
  ResolveThread,
  Session,
  SessionEvent,
  SessionId,
  SessionStageInfo,
  Workflow,
  WorkflowRunId,
} from '@goodboy/types';
import { useAppStore, useSessionHasUnread } from '../../../../../../store';
import { resolveWorkflowAdvance } from '../../../../../workflows/advanceGate';
import {
  viewWorkflowAdvance,
  type WorkflowAdvanceView,
} from '../../../../../workflows/workflowAdvanceView';
import { workflowRunHasOpenQuestions } from '../../../../../context/openQuestionsGate';
import { useResolverIndex } from '../../../../../session/hooks/useResolverIndex';
import { eligibleReviewThreadCount } from '../../../../../suggestions/eligibleThreads';
import { pendingMountProposals } from '../../../../../suggestions/mountProposals';
import { SUGGESTION_ICONS } from '../../../../../suggestions/suggestionIcons';
import type { BoardNavigation } from '../../useBoardNavigation';

export type DynamicAction = {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly tone: Extract<Tone, 'primary' | 'warning' | 'danger'>;
  readonly label: string;
  readonly onClick: () => void;
};

type RunAdvance = {
  readonly runId: WorkflowRunId;
  readonly view: WorkflowAdvanceView;
  readonly hasStartableStep: boolean;
};

const EMPTY_QUESTIONS: ReadonlyArray<OpenQuestion> = [];
const EMPTY_WORKFLOWS: ReadonlyArray<Workflow> = [];
const EMPTY_RUNS: ReadonlyArray<Agent> = [];
const EMPTY_EVENTS: ReadonlyArray<SessionEvent> = [];
const EMPTY_RESOLVE_ROWS: ReadonlyArray<ResolveThread> = [];
const MAX_MOUNT_ACTIONS = 2;

export const useDynamicActions = (
  session: Session,
  nav: BoardNavigation,
  stage: SessionStageInfo['stage'],
): ReadonlyArray<DynamicAction> => {
  const id = session.id as SessionId;
  const openQuestions = useAppStore((s) => s.sessionOpenQuestions[id] ?? EMPTY_QUESTIONS);
  const workflows = useAppStore((s) => s.sessionWorkflows[id] ?? EMPTY_WORKFLOWS);
  const runs = useAppStore((s) => s.sessionPhaseRuns[id] ?? EMPTY_RUNS);
  const isSummarizerRunning = useAppStore((s) => s.summarizerStatus[id]?.status === 'running');
  const skipStuckStepAndAdvance = useAppStore((s) => s.skipStuckStepAndAdvance);
  const events = useAppStore((s) => s.sessionEvents?.[id] ?? EMPTY_EVENTS);
  const github = useAppStore((s) => s.sessionGithub[id] ?? null);
  const resolveRows = useAppStore((s) => s.sessionResolveThreads[id] ?? EMPTY_RESOLVE_ROWS);
  const materializeProject = useAppStore((s) => s.materializeProject);
  const emitNotification = useAppStore((s) => s.emitNotification);
  const resolverIndex = useResolverIndex(id);
  const hasUnread = useSessionHasUnread(id);
  const [isConfirmingSkip, setIsConfirmingSkip] = useState(false);

  const mountProposals = useMemo(() => pendingMountProposals({ events }), [events]);
  const eligibleThreads = useMemo(
    () => eligibleReviewThreadCount({ github, rows: resolveRows }),
    [github, resolveRows],
  );

  const advances = useMemo(() => {
    const out: Array<RunAdvance> = [];
    for (const run of session.workflowRuns) {
      if (run.discardedAt) {
        continue;
      }
      const workflow = workflows.find((w) => w.id === run.workflowId);
      if (!workflow) {
        continue;
      }
      const runAgents = runs.filter((agent) => agent.workflowRunId === run.id);
      const view = viewWorkflowAdvance({
        state: resolveWorkflowAdvance({
          workflow,
          agents: runAgents,
          hasOpenQuestions: workflowRunHasOpenQuestions(openQuestions, run.id),
          isSummarizerRunning,
          isTurnRunning: false,
        }),
      });
      const manualStepId = view.manualStep?.id ?? null;
      out.push({
        runId: run.id,
        view,
        hasStartableStep:
          manualStepId != null &&
          runAgents.some((agent) => agent.stepId === manualStepId && agent.status === 'pending'),
      });
    }
    return out;
  }, [session.workflowRuns, workflows, runs, openQuestions, isSummarizerRunning]);

  const blocked = advances.find((advance) => advance.view.failedStep != null) ?? null;
  const blockedRunId = blocked?.runId ?? null;
  const blockedStepName = blocked?.view.failedStep?.name ?? null;

  useEffect(() => {
    if (blockedRunId != null) {
      return;
    }
    setIsConfirmingSkip(false);
  }, [blockedRunId]);

  return useMemo(() => {
    const openCount = openQuestions.filter((q) => q.status === 'open').length;
    const nextStepReady =
      stage !== 'running' && advances.some((advance) => advance.hasStartableStep);

    const actions: DynamicAction[] = [];
    if (blockedRunId != null && isConfirmingSkip) {
      actions.push({
        key: 'blocked',
        icon: Check,
        tone: 'danger',
        label: 'Confirm skip and continue',
        onClick: () => {
          setIsConfirmingSkip(false);
          void skipStuckStepAndAdvance(id, blockedRunId, { onlyWhenBlocked: true });
        },
      });
    }
    if (blockedRunId != null && !isConfirmingSkip) {
      actions.push({
        key: 'blocked',
        icon: SkipForward,
        tone: 'warning',
        label:
          blockedStepName != null
            ? `Skip blocked step: ${blockedStepName}`
            : 'Skip the blocked step',
        onClick: () => setIsConfirmingSkip(true),
      });
    }
    if (openCount > 0) {
      actions.push({
        key: 'questions',
        icon: SUGGESTION_ICONS['answer-questions'],
        tone: 'warning',
        label: openCount === 1 ? '1 open question' : `${openCount} open questions`,
        onClick: () => nav.openQuestions(session),
      });
    }
    for (const proposal of mountProposals.slice(0, MAX_MOUNT_ACTIONS)) {
      actions.push({
        key: `mount:${proposal.projectId}`,
        icon: SUGGESTION_ICONS['mount-project'],
        tone: 'warning',
        label: `Mount ${proposal.projectName}`,
        onClick: () => {
          void materializeProject({
            sessionId: id,
            projectId: proposal.projectId,
            reason: proposal.reason,
          }).catch((error: unknown) => {
            void emitNotification('error', 'error', 'Mount failed', formatError(error), {
              sessionId: id,
            });
          });
        },
      });
    }
    if (github?.pr != null && eligibleThreads > 0) {
      actions.push({
        key: 'resolve',
        icon: SUGGESTION_ICONS['resolve-threads'],
        tone: 'primary',
        label: `Resolve ${eligibleThreads} ${eligibleThreads === 1 ? 'comment' : 'comments'}`,
        onClick: () => nav.openGithub(session),
      });
    }
    if (nextStepReady) {
      actions.push({
        key: 'run',
        icon: SUGGESTION_ICONS['workflow-next-step'],
        tone: 'primary',
        label: 'Continue',
        onClick: () => nav.openWorkflows(session),
      });
    }
    if (hasUnread) {
      actions.push({
        key: 'unread',
        icon: MessageSquare,
        tone: 'primary',
        label: 'unread reply',
        onClick: () => nav.openAgent(session),
      });
    }
    return actions;
  }, [
    session,
    nav,
    stage,
    openQuestions,
    hasUnread,
    advances,
    blockedRunId,
    blockedStepName,
    isConfirmingSkip,
    skipStuckStepAndAdvance,
    mountProposals,
    materializeProject,
    emitNotification,
    github,
    eligibleThreads,
    id,
  ]);
};
