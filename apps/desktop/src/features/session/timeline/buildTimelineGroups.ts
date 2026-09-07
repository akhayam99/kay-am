import type { SessionWorktree } from '@goodboy/db';
import type {
  Agent,
  OpenQuestion,
  PlanWithCount,
  SessionEvent,
  SessionExternalTask,
  SessionId,
  Workflow,
  WorkflowRun,
} from '@goodboy/types';
import { classifyAgent, type AgentKind } from '../agent-kind';
import { attachedQuestionsFor } from './attachedQuestions';
import { earliestEvidence, resolveAgentCreation, type AgentCreation } from './agentCreation';
import { runIdentity, runIdentitySeed, type RunIdentity } from './runIdentity';

type TimelineChain = {
  readonly identity: RunIdentity;
};

export type TimelineAgentEntry = {
  readonly kind: 'agent';
  readonly id: string;
  readonly at: string | null;
  readonly ordinal: number;
  readonly agent: Agent;
  readonly agentKind: AgentKind;
  readonly stepLabel: string | null;
  readonly openQuestions: ReadonlyArray<OpenQuestion>;
  readonly terminalQuestions: ReadonlyArray<OpenQuestion>;
  readonly children: ReadonlyArray<TimelineAgentEntry>;
  readonly answers: ReadonlyArray<TimelineAnswerEntry>;
  readonly hasDuration: boolean;
  readonly chain: TimelineChain | null;
};

export type TimelinePlanEntry = {
  readonly kind: 'plan';
  readonly id: string;
  readonly at: string;
  readonly plan: PlanWithCount;
  readonly lane?: {
    readonly identity: RunIdentity;
    readonly rootEntryId: string;
  };
};

export type TimelineIssueEntry = {
  readonly kind: 'issue';
  readonly id: string;
  readonly at: string;
  readonly task: SessionExternalTask;
};

export type TimelineBranchEntry = {
  readonly kind: 'branch';
  readonly id: string;
  readonly at: string;
  readonly worktree: SessionWorktree;
};

export type TimelineProjectRun = {
  readonly mounted: ReadonlyArray<string>;
  readonly detached: ReadonlyArray<string>;
};

export type TimelineEventEntry = {
  readonly kind: 'event';
  readonly id: string;
  readonly at: string;
  readonly event: SessionEvent;
  readonly projectRun?: TimelineProjectRun;
};

export type TimelineAnswerEntry = {
  readonly kind: 'answer';
  readonly id: string;
  readonly at: string;
  readonly question: OpenQuestion;
};

export type TimelineQuestionLane = {
  readonly identity: RunIdentity;
  readonly rootEntryId: string;
};

export type TimelineQuestionEntry = {
  readonly kind: 'question';
  readonly id: string;
  readonly at: string;
  readonly questions: ReadonlyArray<OpenQuestion>;
  readonly lane: TimelineQuestionLane | null;
};

type TimelineRunChild = TimelineAgentEntry | TimelinePlanEntry;

export type TimelineRunEntry = {
  readonly kind: 'run';
  readonly id: string;
  readonly at: string;
  readonly run: WorkflowRun;
  readonly workflow: Workflow;
  readonly identity: RunIdentity;
  readonly children: ReadonlyArray<TimelineRunChild>;
  readonly producedPlan: PlanWithCount | null;
};

export type TimelineTopLevelEntry =
  | TimelineAgentEntry
  | TimelinePlanEntry
  | TimelineIssueEntry
  | TimelineBranchEntry
  | TimelineEventEntry
  | TimelineRunEntry
  | TimelineQuestionEntry;

export type TimelineModel = {
  readonly entries: ReadonlyArray<TimelineTopLevelEntry>;
};

type AttachedWorkflow = {
  readonly run: WorkflowRun;
  readonly workflow: Workflow;
};

type Params = {
  readonly sessionId: SessionId;
  readonly agents: ReadonlyArray<Agent>;
  readonly workflows: ReadonlyArray<AttachedWorkflow>;
  readonly plans: ReadonlyArray<PlanWithCount>;
  readonly externalTasks: ReadonlyArray<SessionExternalTask>;
  readonly questions: ReadonlyArray<OpenQuestion>;
  readonly worktrees: ReadonlyArray<SessionWorktree>;
  readonly events: ReadonlyArray<SessionEvent>;
  readonly agentKindOverride: Readonly<Record<string, AgentKind>>;
};

type WorktreeParams = {
  readonly worktree: SessionWorktree;
};

type SortableEntry = {
  readonly at: string | null;
  readonly ordinal: number;
  readonly id: string;
};

type LaneOwner = {
  readonly id: string;
  readonly createdAt: string | null;
};

const timestampForWorktree = ({ worktree }: WorktreeParams): string =>
  new Date(worktree.createdAt).toISOString();

type BuildAnswersParams = {
  readonly questions: ReadonlyArray<OpenQuestion>;
  readonly parentId: string;
};

const buildAnswers = ({
  questions,
  parentId,
}: BuildAnswersParams): ReadonlyArray<TimelineAnswerEntry> =>
  questions.flatMap((question) => {
    if (question.status !== 'answered' || question.answeredAt == null) {
      return [];
    }
    return [
      {
        kind: 'answer',
        id: `answer:${parentId}:${question.id}`,
        at: question.answeredAt,
        question,
      },
    ];
  });

const compareNewestFirst = (first: SortableEntry, second: SortableEntry): number => {
  if (first.at != null && second.at != null && first.at !== second.at) {
    return second.at.localeCompare(first.at);
  }
  if (first.at == null && second.at != null) {
    return -1;
  }
  if (first.at != null && second.at == null) {
    return 1;
  }
  return second.ordinal - first.ordinal || first.id.localeCompare(second.id);
};

export const buildTimelineGroups = ({
  sessionId,
  agents,
  workflows,
  plans,
  externalTasks,
  questions,
  worktrees,
  events,
  agentKindOverride,
}: Params): TimelineModel => {
  const seed = runIdentitySeed({ sessionId });
  const liveAgents = agents.filter((agent) => agent.deletedAt == null);
  const creations = resolveAgentCreation({ agents: liveAgents });
  const byOrdinal = [...liveAgents].sort((first, second) => first.ordinal - second.ordinal);

  const childrenByParentId = new Map<string, ReadonlyArray<Agent>>();
  for (const agent of byOrdinal) {
    if (agent.parentAgentId == null) {
      continue;
    }
    const siblings = childrenByParentId.get(agent.parentAgentId) ?? [];
    childrenByParentId.set(agent.parentAgentId, [...siblings, agent]);
  }

  const liveAgentById = new Map(byOrdinal.map((agent) => [agent.id, agent]));
  const chainRootIdByAgentId = new Map<string, Agent['id']>();
  for (const agent of byOrdinal) {
    const visitedAgentIds = new Set<string>();
    let currentAgent: Agent | undefined = agent;
    while (currentAgent != null && !visitedAgentIds.has(currentAgent.id)) {
      visitedAgentIds.add(currentAgent.id);
      if (currentAgent.parentAgentId == null) {
        chainRootIdByAgentId.set(agent.id, currentAgent.id);
        break;
      }
      currentAgent = liveAgentById.get(currentAgent.parentAgentId);
    }
  }

  const chainRoots = byOrdinal.filter(
    (agent) => agent.parentAgentId == null && (childrenByParentId.get(agent.id) ?? []).length > 0,
  );
  const chainRootIds = new Set(chainRoots.map((agent) => agent.id));
  const laneOwners: ReadonlyArray<LaneOwner> = [
    ...workflows.flatMap(({ run }) =>
      run.createdAt == null ? [] : [{ id: run.id, createdAt: run.createdAt }],
    ),
    ...chainRoots.map((agent) => ({
      id: agent.id,
      createdAt: earliestEvidence({ agent }),
    })),
  ].sort(
    (first, second) =>
      (first.createdAt ?? '￿').localeCompare(second.createdAt ?? '￿') ||
      first.id.localeCompare(second.id),
  );
  const laneIndexById = new Map(laneOwners.map((owner, laneIndex) => [owner.id, laneIndex]));

  const identityFor = ({ runId }: { readonly runId: string }): RunIdentity => {
    const laneIndex = laneIndexById.get(runId);
    if (laneIndex === undefined) {
      throw new Error(`lane identity is missing for ${runId}`);
    }
    return runIdentity({ laneIndex, seed });
  };

  const stepsByRunId = new Map<string, ReadonlyArray<Agent>>();
  for (const agent of byOrdinal) {
    if (agent.parentAgentId != null || agent.workflowRunId == null || agent.stepId == null) {
      continue;
    }
    const steps = stepsByRunId.get(agent.workflowRunId) ?? [];
    stepsByRunId.set(agent.workflowRunId, [...steps, agent]);
  }

  const creationOf = ({ agent }: { readonly agent: Agent }): AgentCreation =>
    creations.get(agent.id) ?? { at: null, ordinal: agent.ordinal, isRecorded: false };

  const buildAgentEntry = ({
    agent,
    stepLabel,
    chain,
  }: {
    readonly agent: Agent;
    readonly stepLabel: string | null;
    readonly chain: TimelineChain | null;
  }): TimelineAgentEntry => {
    const creation = creationOf({ agent });
    const attachedQuestions = attachedQuestionsFor({ questions, agent });
    const entryId = `agent:${agent.id}`;
    const childAgents = childrenByParentId.get(agent.id) ?? [];
    const children = childAgents
      .map((child, index) =>
        buildAgentEntry({
          agent: child,
          stepLabel: stepLabel == null ? null : `${stepLabel}.${index + 1}`,
          chain,
        }),
      )
      .sort(compareNewestFirst);
    return {
      kind: 'agent',
      id: entryId,
      at: creation.at,
      ordinal: agent.ordinal,
      agent,
      agentKind: classifyAgent(agent, agentKindOverride[agent.id] ?? null),
      stepLabel,
      openQuestions: attachedQuestions.filter((question) => question.status === 'open'),
      terminalQuestions: attachedQuestions.filter((question) => question.status !== 'open'),
      children,
      answers: buildAnswers({ questions: attachedQuestions, parentId: entryId }),
      hasDuration: agent.startedAt != null && agent.completedAt != null,
      chain,
    };
  };

  const runEntries: ReadonlyArray<TimelineRunEntry> = workflows.flatMap(({ run, workflow }) => {
    if (run.createdAt == null) {
      return [];
    }
    const steps = stepsByRunId.get(run.id) ?? [];
    const stepEntries = steps.map((agent, index) =>
      buildAgentEntry({ agent, stepLabel: `${index + 1}`, chain: null }),
    );
    const runPlans: ReadonlyArray<TimelinePlanEntry> = plans
      .filter((plan) => plan.workflowRunId === run.id)
      .map((plan) => ({ kind: 'plan', id: `plan:${plan.id}`, at: plan.createdAt, plan }));
    const children: ReadonlyArray<TimelineRunChild> = [...stepEntries, ...runPlans].sort(
      (first, second) =>
        compareNewestFirst(
          { at: first.at, ordinal: first.kind === 'agent' ? first.ordinal : 0, id: first.id },
          { at: second.at, ordinal: second.kind === 'agent' ? second.ordinal : 0, id: second.id },
        ),
    );
    const producedPlan =
      [...plans]
        .filter((plan) => plan.workflowRunId === run.id)
        .sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0] ?? null;
    return [
      {
        kind: 'run',
        id: `run:${run.id}`,
        at: run.createdAt,
        run,
        workflow,
        identity: identityFor({ runId: run.id }),
        children,
        producedPlan,
      },
    ];
  });

  const runIds = new Set(runEntries.map((entry) => entry.run.id));
  const groupedPlanIds = new Set(
    runEntries
      .flatMap((entry) => entry.children)
      .flatMap((child) => (child.kind === 'plan' ? [child.plan.id] : [])),
  );
  const standaloneAgents = byOrdinal
    .filter(
      (agent) =>
        agent.parentAgentId == null &&
        !(agent.workflowRunId != null && agent.stepId != null && runIds.has(agent.workflowRunId)),
    )
    .map((agent) => {
      const hasDescendants = (childrenByParentId.get(agent.id) ?? []).length > 0;
      return buildAgentEntry({
        agent,
        stepLabel: null,
        chain: hasDescendants ? { identity: identityFor({ runId: agent.id }) } : null,
      });
    });
  const standalonePlans: ReadonlyArray<TimelinePlanEntry> = plans
    .filter((plan) => !groupedPlanIds.has(plan.id))
    .map((plan) => {
      const rootId = chainRootIdByAgentId.get(plan.agentId);
      return {
        kind: 'plan',
        id: `plan:${plan.id}`,
        at: plan.createdAt,
        plan,
        ...(rootId != null && chainRootIds.has(rootId)
          ? {
              lane: {
                identity: identityFor({ runId: rootId }),
                rootEntryId: `agent:${rootId}`,
              },
            }
          : {}),
      };
    });

  const authorAgentIdByQuestionId = new Map<string, Agent['id']>();
  for (const candidate of byOrdinal) {
    for (const attached of attachedQuestionsFor({ questions, agent: candidate })) {
      if (!authorAgentIdByQuestionId.has(attached.id)) {
        authorAgentIdByQuestionId.set(attached.id, candidate.id);
      }
    }
  }

  const questionLaneFor = ({
    authorAgentId,
  }: {
    readonly authorAgentId: Agent['id'] | undefined;
  }): TimelineQuestionLane | null => {
    if (authorAgentId == null) {
      return null;
    }
    const rootId = chainRootIdByAgentId.get(authorAgentId) ?? authorAgentId;
    const rootAgent = liveAgentById.get(rootId);
    if (
      rootAgent != null &&
      rootAgent.workflowRunId != null &&
      rootAgent.stepId != null &&
      runIds.has(rootAgent.workflowRunId)
    ) {
      return {
        identity: identityFor({ runId: rootAgent.workflowRunId }),
        rootEntryId: `run:${rootAgent.workflowRunId}`,
      };
    }
    if (chainRootIds.has(rootId)) {
      return { identity: identityFor({ runId: rootId }), rootEntryId: `agent:${rootId}` };
    }
    return null;
  };

  const questionTimestamp = ({ question }: { readonly question: OpenQuestion }): string =>
    question.status === 'open'
      ? question.createdAt
      : (question.answeredAt ?? question.dismissedAt ?? question.createdAt);

  const questionEntries: ReadonlyArray<TimelineQuestionEntry> = questions.map((question) => ({
    kind: 'question',
    id: `question:${question.id}`,
    at: questionTimestamp({ question }),
    questions: [question],
    lane: questionLaneFor({ authorAgentId: authorAgentIdByQuestionId.get(question.id) }),
  }));

  const issues: ReadonlyArray<TimelineIssueEntry> = externalTasks.map((task) => ({
    kind: 'issue',
    id: `issue:${task.provider}:${task.externalId}`,
    at: task.createdAt,
    task,
  }));
  const linkedIssueUrls = new Set(
    events.flatMap((event) =>
      event.kind === 'issue_linked' && event.payload?.url != null ? [event.payload.url] : [],
    ),
  );
  const visibleIssues = issues.filter((entry) => !linkedIssueUrls.has(entry.task.url));
  const hasBranchEvent = events.some((event) => event.kind === 'branch_created');
  const materializedProjectIds = new Set(
    events.flatMap((event) =>
      event.kind === 'project_materialized' && event.payload?.projectId != null
        ? [event.payload.projectId]
        : [],
    ),
  );
  const branches: ReadonlyArray<TimelineBranchEntry> = hasBranchEvent
    ? []
    : worktrees
        .filter(
          (worktree) =>
            worktree.branch !== '' &&
            (worktree.projectId == null || !materializedProjectIds.has(worktree.projectId)),
        )
        .map((worktree) => ({
          kind: 'branch',
          id: `branch:${worktree.id}`,
          at: timestampForWorktree({ worktree }),
          worktree,
        }));
  const hasProjectMount = worktrees.some((worktree) => worktree.projectId != null);
  const eventEntries: ReadonlyArray<TimelineEventEntry> = events.flatMap((event) => {
    if (event.kind === 'worktree_created' && hasProjectMount) {
      return [];
    }
    return [
      {
        kind: 'event',
        id: `event:${event.id}`,
        at: event.createdAt,
        event,
      },
    ];
  });

  const entries = [
    ...runEntries,
    ...standaloneAgents,
    ...standalonePlans,
    ...questionEntries,
    ...visibleIssues,
    ...branches,
    ...eventEntries,
  ].sort((first, second) =>
    compareNewestFirst(
      { at: first.at, ordinal: first.kind === 'agent' ? first.ordinal : 0, id: first.id },
      { at: second.at, ordinal: second.kind === 'agent' ? second.ordinal : 0, id: second.id },
    ),
  );

  return { entries };
};
