import type { PlanId, ProjectId, SessionId, StepId, WorkflowRunId } from '@goodboy/types';
import { pendingMountEvents, type SuggestionMountEvent } from './mountProposals';
import type { SessionSuggestion } from './types';

export type SuggestionWorkflowRun = {
  readonly id: WorkflowRunId;
  readonly title: string;
  readonly advanceState: { readonly kind: string; readonly stepId?: StepId };
  readonly isRunning: boolean;
};

export type SuggestionPlan = {
  readonly id: PlanId;
  readonly title: string;
  readonly status: string;
  readonly creatorHasOpenQuestions: boolean;
};

export type SuggestionRebaseRequest = {
  readonly behind: number | null;
  readonly baseBranch: string | null;
  readonly agentStatus: string | null;
};

export type SuggestionProject = {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly worktreePath: string;
  readonly baseBranch: string;
  readonly mainDistance: number | null;
  readonly rebaseRequest?: SuggestionRebaseRequest | null;
};

const isRebaseConsumed = ({ project }: { readonly project: SuggestionProject }): boolean => {
  const request = project.rebaseRequest ?? null;
  if (request == null || request.agentStatus === 'failed') {
    return false;
  }
  if (request.baseBranch != null && request.baseBranch !== project.baseBranch) {
    return false;
  }
  return request.behind === project.mainDistance;
};

type Params = {
  readonly sessionId: SessionId;
  readonly workflowRuns: ReadonlyArray<SuggestionWorkflowRun>;
  readonly plans: ReadonlyArray<SuggestionPlan>;
  readonly consumedPlanIds: ReadonlySet<PlanId>;
  readonly openQuestionCount: number;
  readonly hasPullRequest: boolean;
  readonly eligibleThreadCount: number;
  readonly projects: ReadonlyArray<SuggestionProject>;
  readonly mountEvents: ReadonlyArray<SuggestionMountEvent>;
};

export const deriveSessionSuggestions = ({
  sessionId,
  workflowRuns,
  plans,
  consumedPlanIds,
  openQuestionCount,
  hasPullRequest,
  eligibleThreadCount,
  projects,
  mountEvents,
}: Params): ReadonlyArray<SessionSuggestion> => {
  const suggestions: SessionSuggestion[] = [];
  for (const event of pendingMountEvents({ mountEvents })) {
    suggestions.push({
      id: `mount-project:${event.projectId}`,
      kind: 'mount-project',
      priority: 5,
      title: `Mount ${event.projectName}`,
      detail: event.reason,
      sessionId,
      payload: {
        projectId: event.projectId,
        projectName: event.projectName,
        reason: event.reason,
        agentId: event.agentId,
        eventId: event.eventId,
      },
    });
  }
  if (openQuestionCount > 0) {
    suggestions.push({
      id: `answer-questions:${sessionId}`,
      kind: 'answer-questions',
      priority: 0,
      title: 'Answer open questions',
      detail: `${openQuestionCount} ${openQuestionCount === 1 ? 'question' : 'questions'} blocking progress`,
      sessionId,
      payload: { count: openQuestionCount },
    });
  }
  for (const run of workflowRuns) {
    if (run.advanceState.kind !== 'ready' || run.advanceState.stepId == null) {
      continue;
    }
    suggestions.push({
      id: `workflow-next-step:${run.id}`,
      kind: 'workflow-next-step',
      priority: 10,
      title: `Continue ${run.title}`,
      sessionId,
      payload: { runId: run.id, stepId: run.advanceState.stepId },
    });
  }
  const activePlan = [...plans].reverse().find((plan) => plan.status === 'active') ?? null;
  const hasRunningWorkflow = workflowRuns.some((run) => run.isRunning);
  if (
    activePlan != null &&
    !activePlan.creatorHasOpenQuestions &&
    !consumedPlanIds.has(activePlan.id) &&
    !hasRunningWorkflow
  ) {
    suggestions.push({
      id: `plan-ready:${activePlan.id}`,
      kind: 'plan-ready',
      priority: 20,
      title: activePlan.title,
      detail: 'Ready to implement',
      sessionId,
      payload: { planId: activePlan.id },
    });
  }
  if (hasPullRequest && eligibleThreadCount > 0) {
    suggestions.push({
      id: `resolve-threads:${sessionId}`,
      kind: 'resolve-threads',
      priority: 30,
      title: 'Fix review conversations',
      detail: `${eligibleThreadCount} ${eligibleThreadCount === 1 ? 'conversation' : 'conversations'}`,
      sessionId,
      payload: { eligibleThreadCount },
    });
  }
  for (const project of projects) {
    if (project.mainDistance == null || project.mainDistance <= 0) {
      continue;
    }
    if (isRebaseConsumed({ project })) {
      continue;
    }
    suggestions.push({
      id: `rebase-project:${project.projectId}`,
      kind: 'rebase-project',
      priority: 40,
      title: `Rebase ${project.projectName} on ${project.baseBranch}`,
      detail: `${project.mainDistance} behind`,
      sessionId,
      payload: {
        projectId: project.projectId,
        worktreePath: project.worktreePath,
        baseBranch: project.baseBranch,
        behind: project.mainDistance,
      },
    });
  }
  return suggestions.sort(
    (first, second) => first.priority - second.priority || first.id.localeCompare(second.id),
  );
};
