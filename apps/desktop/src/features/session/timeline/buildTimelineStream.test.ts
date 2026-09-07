import { describe, expect, it } from 'vitest';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  OpenQuestion,
  OpenQuestionId,
  PlanId,
  PlanWithCount,
  SessionEvent,
  SessionEventId,
  SessionEventKind,
  SessionEventPayload,
  SessionId,
  Step,
  StepId,
  Workflow,
  WorkflowExecutionMode,
  WorkflowId,
  WorkflowOrchestrationOutcome,
  WorkflowRun,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';
import { buildTimelineGroups } from './buildTimelineGroups';
import { buildTimelineStream, type TimelineStreamItem } from './buildTimelineStream';
import { dayLabel } from './dayLabel';
import { layoutTimelineRail } from './railGeometry';
import { runIdentity, runIdentitySeed } from './runIdentity';
import { markerCenterY, TIMELINE_RHYTHM } from './timelineRhythm';

type TypedStringParams = {
  readonly value: string;
};

const typedString = <Value extends string>({ value }: TypedStringParams): Value =>
  JSON.parse(JSON.stringify(value));

const SESSION_ID = typedString<SessionId>({ value: 'session-1' });
const RUN_ID = typedString<WorkflowRunId>({ value: 'run-1' });
const OTHER_RUN_ID = typedString<WorkflowRunId>({ value: 'run-2' });

const NOW = new Date(2026, 7, 18, 12, 0);

const localIso = ({
  day,
  hour,
  minute = 0,
}: {
  readonly day: number;
  readonly hour: number;
  readonly minute?: number;
}): string => new Date(2026, 7, day, hour, minute).toISOString();

type AgentParams = {
  readonly id: string;
  readonly ordinal: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly workflowRunId?: WorkflowRunId;
  readonly parentAgentId?: string;
  readonly status?: Agent['status'];
  readonly lastFinishedAt?: string;
};

const agent = ({
  id,
  ordinal,
  startedAt,
  completedAt,
  workflowRunId,
  parentAgentId,
  status = 'completed',
  lastFinishedAt,
}: AgentParams): Agent => ({
  id: typedString<AgentId>({ value: id }),
  sessionId: SESSION_ID,
  stepId:
    workflowRunId != null && parentAgentId == null
      ? typedString<StepId>({ value: `step-${id}` })
      : undefined,
  workflowRunId,
  ...(parentAgentId != null
    ? { parentAgentId: typedString<AgentId>({ value: parentAgentId }) }
    : {}),
  ordinal,
  name: id,
  status,
  ...(startedAt != null ? { startedAt: typedString<IsoDateTime>({ value: startedAt }) } : {}),
  ...(completedAt != null ? { completedAt: typedString<IsoDateTime>({ value: completedAt }) } : {}),
  ...(lastFinishedAt != null
    ? { lastFinishedAt: typedString<IsoDateTime>({ value: lastFinishedAt }) }
    : {}),
});

type WorkflowParams = {
  readonly runId?: WorkflowRunId;
  readonly name?: string;
  readonly createdAt: string;
  readonly stepIds?: ReadonlyArray<string>;
  readonly executionMode?: WorkflowExecutionMode;
  readonly orchestrationOutcome?: WorkflowOrchestrationOutcome;
};

const attachedWorkflow = ({
  runId = RUN_ID,
  name = 'Release workflow',
  createdAt,
  stepIds = [],
  executionMode = 'static',
  orchestrationOutcome,
}: WorkflowParams): { readonly run: WorkflowRun; readonly workflow: Workflow } => {
  const workflowId = typedString<WorkflowId>({ value: `workflow-${runId}` });
  const steps: ReadonlyArray<Step> = stepIds.map((stepId, index) => ({
    id: typedString<StepId>({ value: `step-${stepId}` }),
    workflowId,
    ordinal: index,
    name: stepId,
    promptPrefix: '',
  }));
  return {
    run: {
      id: runId,
      workflowId,
      ordinal: 0,
      currentStep: 0,
      autoRun: false,
      triggerMode: 'manual',
      executionMode,
      ...(orchestrationOutcome != null ? { orchestrationOutcome } : {}),
      createdAt: typedString<IsoDateTime>({ value: createdAt }),
    },
    workflow: {
      id: workflowId,
      workspaceId: typedString<WorkspaceId>({ value: 'workspace-1' }),
      name,
      description: '',
      steps,
      createdAt: typedString<IsoDateTime>({ value: createdAt }),
      updatedAt: typedString<IsoDateTime>({ value: createdAt }),
    },
  };
};

const RUN_WITH_PENDING_AGENTS: ReadonlyArray<Agent> = [
  agent({
    id: 'plan',
    ordinal: 1,
    startedAt: localIso({ day: 18, hour: 9 }),
    completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
    workflowRunId: RUN_ID,
  }),
  agent({
    id: 'implement',
    ordinal: 2,
    status: 'running',
    startedAt: localIso({ day: 18, hour: 10 }),
    workflowRunId: RUN_ID,
  }),
  agent({ id: 'test', ordinal: 3, status: 'pending', workflowRunId: RUN_ID }),
  agent({ id: 'review', ordinal: 4, status: 'pending', workflowRunId: RUN_ID }),
  agent({ id: 'ship', ordinal: 5, status: 'pending', workflowRunId: RUN_ID }),
  agent({ id: 'built-by-hand', ordinal: 6, startedAt: localIso({ day: 18, hour: 11 }) }),
];

type StreamParams = {
  readonly agents: ReadonlyArray<Agent>;
  readonly workflows?: ReadonlyArray<ReturnType<typeof attachedWorkflow>>;
  readonly unreadAgentIds?: ReadonlySet<string>;
  readonly decidingRunIds?: ReadonlySet<string>;
  readonly events?: ReadonlyArray<SessionEvent>;
  readonly plans?: ReadonlyArray<PlanWithCount>;
  readonly questions?: ReadonlyArray<OpenQuestion>;
  readonly showWorkflowSubagents?: boolean;
  readonly showAgentSubagents?: boolean;
  readonly showPlans?: boolean;
  readonly showQuestions?: boolean;
};

const stream = ({
  agents,
  workflows = [],
  unreadAgentIds = new Set(),
  decidingRunIds = new Set(),
  events = [],
  plans = [],
  questions = [],
  showWorkflowSubagents,
  showAgentSubagents,
  showPlans,
  showQuestions,
}: StreamParams) =>
  buildTimelineStream({
    entries: buildTimelineGroups({
      sessionId: SESSION_ID,
      agents,
      workflows,
      plans,
      externalTasks: [],
      questions,
      worktrees: [],
      events,
      agentKindOverride: {},
    }).entries,
    unreadAgentIds,
    blockedRunIds: new Set(),
    decidingRunIds,
    dayLabelFor: ({ at }) => dayLabel({ at, now: NOW }),
    ...(showWorkflowSubagents != null ? { showWorkflowSubagents } : {}),
    ...(showAgentSubagents != null ? { showAgentSubagents } : {}),
    ...(showPlans != null ? { showPlans } : {}),
    ...(showQuestions != null ? { showQuestions } : {}),
  });

type LaneSpan = {
  readonly from: number;
  readonly to: number;
};

type LaneSpanParams = {
  readonly items: ReadonlyArray<TimelineStreamItem>;
  readonly layout: ReturnType<typeof layoutTimelineRail>;
};

const laneSpansOf = ({ items, layout }: LaneSpanParams): ReadonlyArray<LaneSpan> => {
  const spans: LaneSpan[] = [];
  let offset = 0;
  for (const [index, item] of items.entries()) {
    const rail = layout.rows[index];
    for (const segment of rail?.segments ?? []) {
      if (segment.column > 0) {
        spans.push({ from: offset + segment.fromY, to: offset + segment.toY });
      }
    }
    for (const join of rail?.joins ?? []) {
      spans.push({ from: offset, to: offset + join.anchorY });
    }
    offset += item.height;
  }
  return [...spans].sort((first, second) => first.from - second.from);
};

const topOfItem = ({
  items,
  index,
}: {
  readonly items: ReadonlyArray<TimelineStreamItem>;
  readonly index: number;
}): number => items.slice(0, index).reduce((total, item) => total + item.height, 0);

const labelOf = (item: TimelineStreamItem): string => {
  if (item.kind === 'row') {
    return `${item.grade}:${item.id}`;
  }
  if (item.kind === 'cluster') {
    return `cluster:${item.steps.length}`;
  }
  if (item.kind === 'day') {
    return `day:${item.label}`;
  }
  return 'now';
};

describe('buildTimelineStream', () => {
  it('draws no day rule directly under NOW, since it would divide nothing', () => {
    const { items } = stream({
      agents: [
        agent({ id: 'older', ordinal: 1, startedAt: localIso({ day: 11, hour: 9 }) }),
        agent({ id: 'oldest', ordinal: 2, startedAt: localIso({ day: 11, hour: 8 }) }),
      ],
    });

    expect(items.map(labelOf)[0]).toBe('now');
    expect(items.map(labelOf)[1]).not.toContain('day:');
    expect(items.filter((item) => item.kind === 'day')).toHaveLength(0);
  });

  it('keeps the day rule where it actually separates two days', () => {
    const { items } = stream({
      agents: [
        agent({ id: 'today', ordinal: 2, startedAt: localIso({ day: 18, hour: 9 }) }),
        agent({ id: 'before', ordinal: 1, startedAt: localIso({ day: 11, hour: 9 }) }),
      ],
    });

    const labels = items.map(labelOf);
    expect(labels[0]).toBe('now');
    expect(labels.some((label) => label.startsWith('day:'))).toBe(true);
    expect(labels.indexOf('entry:agent:before')).toBeGreaterThan(
      labels.findIndex((label) => label.startsWith('day:')),
    );
  });

  it('puts the run origin at the bottom of its group with steps stacking upward', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'three',
          ordinal: 3,
          startedAt: localIso({ day: 18, hour: 11 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:three',
      'step:agent:two',
      'step:agent:one',
      'entry:run:run-1',
    ]);
  });

  it('numbers a run bottom to top so ordinals climb with the clock', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'first',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'second',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'third',
          ordinal: 3,
          startedAt: localIso({ day: 18, hour: 11 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const ordinals = items.flatMap((item) =>
      item.kind === 'row' && item.ordinal != null ? [item.ordinal] : [],
    );

    expect(ordinals).toEqual(['3', '2', '1']);
  });

  it('keeps every row of an unfinished run drawn whatever its age', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 10, hour: 8 }) })],
      agents: [
        agent({
          id: 'done',
          ordinal: 1,
          startedAt: localIso({ day: 10, hour: 9 }),
          completedAt: localIso({ day: 10, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'todo', ordinal: 2, status: 'pending', workflowRunId: RUN_ID }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:todo',
      'day:Aug 10',
      'step:agent:done',
      'entry:run:run-1',
    ]);
  });

  it('draws a settled run from yesterday step by step instead of summarising it', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 17, hour: 8 }) })],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 17, hour: 9 }),
          completedAt: localIso({ day: 17, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 17, hour: 10 }),
          completedAt: localIso({ day: 17, hour: 10, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:two',
      'step:agent:one',
      'entry:run:run-1',
    ]);
  });

  it('draws every entry of an old day in its own place, never behind a count', () => {
    const { items } = stream({
      workflows: [
        attachedWorkflow({ createdAt: localIso({ day: 12, hour: 8 }) }),
        attachedWorkflow({
          runId: OTHER_RUN_ID,
          name: 'Refactor workflow',
          createdAt: localIso({ day: 12, hour: 11 }),
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 12, hour: 9 }),
          completedAt: localIso({ day: 12, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 12, hour: 12 }),
          completedAt: localIso({ day: 12, hour: 13 }),
          workflowRunId: OTHER_RUN_ID,
        }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:two',
      'entry:run:run-2',
      'step:agent:one',
      'entry:run:run-1',
    ]);
  });

  it('emits a day divider only where one day actually meets another', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 12, hour: 8 }) })],
      agents: [
        agent({
          id: 'old',
          ordinal: 1,
          startedAt: localIso({ day: 12, hour: 9 }),
          completedAt: localIso({ day: 12, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'loose', ordinal: 2, startedAt: localIso({ day: 12, hour: 11 }) }),
      ],
    });

    expect(items.filter((item) => item.kind === 'day')).toHaveLength(0);
    expect(items.map(labelOf)).toEqual([
      'now',
      'entry:agent:loose',
      'step:agent:old',
      'entry:run:run-1',
    ]);
  });

  it('coalesces a stretch of consecutive pending steps into one marker', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'running',
          ordinal: 1,
          status: 'running',
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'next', ordinal: 2, status: 'pending', workflowRunId: RUN_ID }),
        agent({ id: 'later', ordinal: 3, status: 'pending', workflowRunId: RUN_ID }),
        agent({ id: 'last', ordinal: 4, status: 'pending', workflowRunId: RUN_ID }),
      ],
    });
    const cluster = items.find((item) => item.kind === 'cluster');

    expect(items.map(labelOf)).toEqual([
      'now',
      'cluster:3',
      'step:agent:running',
      'entry:run:run-1',
    ]);
    expect(cluster?.kind === 'cluster' ? cluster.height : 0).toBe(
      3 * TIMELINE_RHYTHM.grade.pending.height,
    );
  });

  it('leaves one lone pending step as its own row', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'running',
          ordinal: 1,
          status: 'running',
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'next', ordinal: 2, status: 'pending', workflowRunId: RUN_ID }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:next',
      'step:agent:running',
      'entry:run:run-1',
    ]);
  });

  it('places a pending block above its run newest dated row', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: RUN_WITH_PENDING_AGENTS,
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'entry:agent:built-by-hand',
      'cluster:3',
      'step:agent:implement',
      'step:agent:plan',
      'entry:run:run-1',
    ]);
  });

  it('runs one unbroken column from the run origin up to the NOW rule', () => {
    const { items, groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: RUN_WITH_PENDING_AGENTS,
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const spans = laneSpansOf({ items, layout });
    const originIndex = items.findIndex((item) => item.id === 'run:run-1');
    const breaks = spans.filter((span, index) => {
      const previous = spans[index - 1];
      return previous !== undefined && span.from > previous.to;
    });

    expect(spans[0]?.from).toBe(items[0]?.topY);
    expect(spans.at(-1)?.to).toBe(
      topOfItem({ items, index: originIndex }) + (layout.rows[originIndex]?.markerY ?? 0),
    );
    expect(breaks).toEqual([]);
  });

  it('dashes the pending stretch of a live run from its elbow up to NOW', () => {
    const { items, groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: RUN_WITH_PENDING_AGENTS,
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const clusterIndex = items.findIndex((item) => item.kind === 'cluster');
    const originIndex = items.findIndex((item) => item.id === 'run:run-1');
    const clusterRail = layout.rows[clusterIndex];
    const originRail = layout.rows[originIndex];
    const nowRail = layout.rows[0];

    expect(originRail?.joins.map((join) => `${join.kind}:${join.dash}`)).toEqual(['branch:solid']);
    expect(originRail?.joins[0]?.path).toBe('M 24 0 C 24 8.84, 16.84 22, 8 22');
    expect(clusterRail?.joins).toEqual([]);
    expect(
      clusterRail?.segments.filter((segment) => segment.column > 0).map((segment) => segment.dash),
    ).toEqual(['dashed', 'dashed']);
    expect(clusterRail?.markerColumn).toBe(1);
    expect(
      nowRail?.segments.filter((segment) => segment.column > 0).map((segment) => segment.dash),
    ).toEqual(['dashed']);
  });

  it('keeps two concurrent runs on their own pending block and their own lane', () => {
    const { items, groups } = stream({
      workflows: [
        attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) }),
        attachedWorkflow({
          runId: OTHER_RUN_ID,
          name: 'Refactor workflow',
          createdAt: localIso({ day: 18, hour: 10 }),
        }),
      ],
      agents: [
        agent({
          id: 'a-done',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'a-next', ordinal: 2, status: 'pending', workflowRunId: RUN_ID }),
        agent({ id: 'a-last', ordinal: 3, status: 'pending', workflowRunId: RUN_ID }),
        agent({
          id: 'b-running',
          ordinal: 4,
          status: 'running',
          startedAt: localIso({ day: 18, hour: 10, minute: 30 }),
          workflowRunId: OTHER_RUN_ID,
        }),
        agent({ id: 'b-next', ordinal: 5, status: 'pending', workflowRunId: OTHER_RUN_ID }),
        agent({ id: 'b-last', ordinal: 6, status: 'pending', workflowRunId: OTHER_RUN_ID }),
      ],
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const clusters = items.flatMap((item, index) =>
      item.kind === 'cluster' ? [{ item, rail: layout.rows[index] }] : [],
    );
    const seed = runIdentitySeed({ sessionId: SESSION_ID });

    expect(items.map(labelOf)).toEqual([
      'now',
      'cluster:2',
      'step:agent:b-running',
      'entry:run:run-2',
      'cluster:2',
      'step:agent:a-done',
      'entry:run:run-1',
    ]);
    expect(clusters.map(({ item }) => item.groupId)).toEqual(['lane:run:run-2', 'lane:run:run-1']);
    expect(clusters.map(({ item }) => item.identity.index)).toEqual([
      runIdentity({ laneIndex: 1, seed }).index,
      runIdentity({ laneIndex: 0, seed }).index,
    ]);
    expect(clusters.map(({ rail }) => rail?.markerColumn)).toEqual([1, 2]);
    expect(clusters.map(({ rail }) => rail?.joins)).toEqual([[], []]);
    expect(layout.columnByGroupId.get('lane:run:run-2')).toBe(1);
    expect(layout.columnByGroupId.get('lane:run:run-1')).toBe(2);
  });

  it('gives a lone pending step no borrowed clock and no day rule of its own', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 10, hour: 8 }) })],
      agents: [
        agent({
          id: 'done',
          ordinal: 1,
          startedAt: localIso({ day: 10, hour: 9 }),
          completedAt: localIso({ day: 10, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'todo', ordinal: 2, status: 'pending', workflowRunId: RUN_ID }),
        agent({ id: 'built-by-hand', ordinal: 3, startedAt: localIso({ day: 18, hour: 11 }) }),
      ],
    });
    const pending = items.find((item) => item.id === 'agent:todo');

    expect(items.map(labelOf)).toEqual([
      'now',
      'entry:agent:built-by-hand',
      'step:agent:todo',
      'day:Aug 10',
      'step:agent:done',
      'entry:run:run-1',
    ]);
    expect(pending?.kind === 'row' ? pending.at : 'borrowed').toBeNull();
  });

  it('breaks the day inside a run that crossed midnight and keeps its lane whole', () => {
    const { items, groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 16, hour: 22, minute: 43 }) })],
      agents: [
        agent({
          id: 'before',
          ordinal: 1,
          startedAt: localIso({ day: 16, hour: 23, minute: 50 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'after',
          ordinal: 2,
          startedAt: localIso({ day: 17, hour: 0, minute: 8 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const dayIndex = items.findIndex((item) => item.kind === 'day' && item.label === 'Aug 16');
    const dayRail = layout.rows[dayIndex];

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:after',
      'day:Aug 16',
      'step:agent:before',
      'entry:run:run-1',
    ]);
    expect(dayRail?.segments.filter((segment) => segment.column === 1)).toHaveLength(1);
  });

  it('hangs a fan-out on its own stub one column past the step it belongs to', () => {
    const { items, groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'implement',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'sub-a',
          ordinal: 2,
          parentAgentId: 'implement',
          startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
        }),
      ],
    });
    const layout = layoutTimelineRail({ rows: items, groups });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:sub-a',
      'step:agent:implement',
      'entry:run:run-1',
    ]);
    expect(layout.columnByGroupId.get('lane:run:run-1')).toBe(1);
    expect(layout.columnByGroupId.get('lane:agent:implement')).toBe(2);
  });

  it('draws a run lane behind a standalone agent between two steps', () => {
    const { items, groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'step-one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'loose', ordinal: 2, startedAt: localIso({ day: 18, hour: 9, minute: 30 }) }),
        agent({
          id: 'step-two',
          ordinal: 3,
          startedAt: localIso({ day: 18, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const looseIndex = items.findIndex((item) => item.id === 'agent:loose');

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:step-two',
      'entry:agent:loose',
      'step:agent:step-one',
      'entry:run:run-1',
    ]);
    expect(layout.rows[looseIndex]?.markerColumn).toBe(0);
    expect(layout.rows[looseIndex]?.segments.filter((segment) => segment.column > 0)).toHaveLength(
      1,
    );
  });

  it('orders workflow steps and standalone agents by each row timestamp', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'step-one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'loose', ordinal: 2, startedAt: localIso({ day: 18, hour: 9, minute: 30 }) }),
        agent({
          id: 'step-two',
          ordinal: 3,
          startedAt: localIso({ day: 18, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:step-two',
      'entry:agent:loose',
      'step:agent:step-one',
      'entry:run:run-1',
    ]);
  });

  it('keeps a chain with its parent when the children landed a day later', () => {
    const { items, groups } = stream({
      agents: [
        agent({
          id: 'cluster-parent',
          ordinal: 1,
          startedAt: localIso({ day: 17, hour: 21, minute: 35 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 40 }),
        }),
        agent({ id: 'elenca', ordinal: 2, startedAt: localIso({ day: 17, hour: 21, minute: 37 }) }),
        agent({
          id: 'cluster-child',
          ordinal: 3,
          parentAgentId: 'cluster-parent',
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
        }),
      ],
      events: [
        sessionEvent({
          id: 'ev-decision',
          kind: 'decisions_changed',
          at: localIso({ day: 17, hour: 23, minute: 27 }),
        }),
      ],
    });
    const layout = layoutTimelineRail({ rows: items, groups });
    const laneSegmentsOf = ({ id }: { readonly id: string }) =>
      layout.rows[items.findIndex((item) => item.id === id)]?.segments.filter(
        (segment) => segment.column > 0,
      ) ?? [];

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:cluster-child',
      'day:Yesterday',
      'entry:event:ev-decision',
      'entry:agent:elenca',
      'entry:agent:cluster-parent',
    ]);
    expect(laneSegmentsOf({ id: 'event:ev-decision' })).toHaveLength(1);
    expect(laneSegmentsOf({ id: 'agent:elenca' })).toHaveLength(1);
    const dayIndex = items.findIndex((item) => item.kind === 'day');

    expect(layout.rows[dayIndex]?.segments.filter((segment) => segment.column > 0)).toHaveLength(1);
  });

  it('centres a marker on its label line, not on a row box carrying leading air', () => {
    const withAir = markerCenterY({ grade: 'entry', gap: 'entry' });
    const boxCentre = (TIMELINE_RHYTHM.gap.entry + TIMELINE_RHYTHM.grade.entry.height) / 2;

    expect(withAir).toBe(TIMELINE_RHYTHM.gap.entry + TIMELINE_RHYTHM.grade.entry.height / 2);
    expect(withAir).not.toBe(boxCentre);
  });

  it('separates two entries more than two steps of one run', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'step-one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'step-two',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          workflowRunId: RUN_ID,
        }),
        agent({ id: 'loose', ordinal: 3, startedAt: localIso({ day: 18, hour: 11 }) }),
      ],
    });
    const gaps = items.flatMap((item) => (item.kind === 'row' ? [`${item.id}:${item.gap}`] : []));

    expect(gaps).toEqual([
      'agent:loose:none',
      'agent:step-two:entry',
      'agent:step-one:sibling',
      'run:run-1:sibling',
    ]);
  });
});

type SessionEventParams = {
  readonly id: string;
  readonly kind: SessionEventKind;
  readonly at: string;
  readonly payload?: SessionEventPayload;
};

const sessionEvent = ({ id, kind, at, payload }: SessionEventParams): SessionEvent => ({
  id: typedString<SessionEventId>({ value: id }),
  sessionId: SESSION_ID,
  kind,
  payload: payload ?? null,
  createdAt: typedString<IsoDateTime>({ value: at }),
});

describe('buildTimelineStream, session events', () => {
  it('merges three consecutive decision changes into the newest row', () => {
    const newestAt = localIso({ day: 18, hour: 12 });
    const result = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-oldest',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 10 }),
          payload: { added: 1, removed: 2 },
        }),
        sessionEvent({
          id: 'ev-middle',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 11 }),
          payload: { added: 3, removed: 1 },
        }),
        sessionEvent({
          id: 'ev-newest',
          kind: 'decisions_changed',
          at: newestAt,
          payload: { added: 2, removed: 4 },
        }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item] : []));
    const row = rows[0];

    expect(rows).toHaveLength(1);
    expect(row?.at).toBe(newestAt);
    expect(row?.entry.kind === 'event' ? row.entry.event.payload : null).toEqual({
      added: 6,
      removed: 7,
    });
  });

  it('keeps decision runs separate across a day boundary', () => {
    const result = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-yesterday',
          kind: 'decisions_changed',
          at: localIso({ day: 17, hour: 23 }),
          payload: { added: 1, removed: 0 },
        }),
        sessionEvent({
          id: 'ev-today',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 1 }),
          payload: { added: 2, removed: 1 },
        }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item] : []));

    expect(rows).toHaveLength(2);
    expect(rows[0]?.entry.kind === 'event' ? rows[0].entry.event.payload : null).toEqual({
      added: 2,
      removed: 1,
    });
    expect(rows[1]?.entry.kind === 'event' ? rows[1].entry.event.payload : null).toEqual({
      added: 1,
      removed: 0,
    });
  });

  it('keeps decision runs separate across an agent row', () => {
    const result = stream({
      agents: [
        agent({ id: 'interleaved', ordinal: 1, startedAt: localIso({ day: 18, hour: 11 }) }),
      ],
      events: [
        sessionEvent({
          id: 'ev-oldest',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 9 }),
          payload: { added: 1, removed: 0 },
        }),
        sessionEvent({
          id: 'ev-older',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 10 }),
          payload: { added: 2, removed: 1 },
        }),
        sessionEvent({
          id: 'ev-newer',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 12 }),
          payload: { added: 3, removed: 2 },
        }),
        sessionEvent({
          id: 'ev-newest',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 13 }),
          payload: { added: 4, removed: 3 },
        }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item] : []));
    const payloads = rows.flatMap((row) =>
      row.entry.kind === 'event' ? [row.entry.event.payload] : [],
    );

    expect(rows.map((row) => row.id)).toEqual([
      'event:ev-newest',
      'agent:interleaved',
      'event:ev-older',
    ]);
    expect(payloads).toEqual([
      { added: 7, removed: 5 },
      { added: 3, removed: 1 },
    ]);
  });

  it('leaves a single decision change unchanged', () => {
    const payload = { added: 1, removed: 2 };
    const result = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-only',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 12 }),
          payload,
        }),
      ],
    });
    const row = result.items.find((item) => item.kind === 'row');

    expect(row?.entry.kind === 'event' ? row.entry.event.payload : null).toBe(payload);
  });

  it('keeps the newest decision row id after merging', () => {
    const result = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-older',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 11 }),
          payload: { added: 1, removed: 0 },
        }),
        sessionEvent({
          id: 'ev-newest',
          kind: 'decisions_changed',
          at: localIso({ day: 18, hour: 12 }),
          payload: { added: 1, removed: 0 },
        }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item] : []));

    expect(rows.map((row) => row.id)).toEqual(['event:ev-newest']);
  });

  it('keeps the worktree row at the bottom when creation events share an instant', () => {
    const at = localIso({ day: 18, hour: 8 });
    const result = stream({
      agents: [],
      events: [
        sessionEvent({ id: 'ev-branch', kind: 'branch_created', at }),
        sessionEvent({ id: 'ev-worktree', kind: 'worktree_created', at }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item.id] : []));

    expect(rows).toEqual(['event:ev-branch', 'event:ev-worktree']);
  });

  it('orders the rest of the trace newest first', () => {
    const result = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-worktree',
          kind: 'worktree_created',
          at: localIso({ day: 18, hour: 8 }),
        }),
        sessionEvent({ id: 'ev-merge', kind: 'pr_merged', at: localIso({ day: 18, hour: 12 }) }),
      ],
    });
    const rows = result.items.flatMap((item) => (item.kind === 'row' ? [item.id] : []));

    expect(rows).toEqual(['event:ev-merge', 'event:ev-worktree']);
  });

  it('recedes the lane of a discarded run together with the lanes of its children', () => {
    const attached = attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) });
    const { groups } = stream({
      workflows: [
        {
          ...attached,
          run: {
            ...attached.run,
            discardedAt: typedString<IsoDateTime>({ value: localIso({ day: 18, hour: 11 }) }),
          },
        },
      ],
      agents: [
        agent({
          id: 'implement',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'sub-a',
          ordinal: 2,
          parentAgentId: 'implement',
          startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
        }),
      ],
    });

    expect(groups.map((group) => group.id)).toEqual(['lane:run:run-1', 'lane:agent:implement']);
    expect(groups.every((group) => group.isMuted)).toBe(true);
    expect(new Set(groups.map((group) => group.identityIndex)).size).toBe(1);
  });

  it('leaves the lanes of a live run at full presence', () => {
    const { groups } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'implement',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'sub-a',
          ordinal: 2,
          parentAgentId: 'implement',
          startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
        }),
      ],
    });

    expect(groups.some((group) => group.isMuted)).toBe(false);
  });

  it('keeps the lane of a live dynamic run open when its spawned steps have settled', () => {
    const { items, groups } = stream({
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one', 'two'],
          executionMode: 'dynamic',
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          completedAt: localIso({ day: 18, hour: 10, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:run:run-1');
    const runRow = items.find((item) => item.id === 'run:run-1');

    expect(lane?.shape).toBe('open');
    expect(runRow?.kind === 'row' ? runRow.markerState : null).toBe('pending');
  });

  it('marks a run whose orchestrator is choosing the next step as deciding, not pending', () => {
    const settledSteps = {
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one'],
          executionMode: 'dynamic',
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    };
    const idle = stream(settledSteps);
    const deciding = stream({ ...settledSteps, decidingRunIds: new Set([RUN_ID]) });
    const idleRow = idle.items.find((item) => item.id === 'run:run-1');
    const decidingRow = deciding.items.find((item) => item.id === 'run:run-1');

    expect(idleRow?.kind === 'row' ? idleRow.markerState : null).toBe('pending');
    expect(decidingRow?.kind === 'row' ? decidingRow.markerState : null).toBe('deciding');
  });

  it('keeps a run with a step in flight on running even while a decision is in flight', () => {
    const { items } = stream({
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one'],
          executionMode: 'dynamic',
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          status: 'running',
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
      ],
      decidingRunIds: new Set([RUN_ID]),
    });
    const runRow = items.find((item) => item.id === 'run:run-1');

    expect(runRow?.kind === 'row' ? runRow.markerState : null).toBe('running');
  });

  it('closes the lane of a dynamic run once the orchestrator declares it done', () => {
    const { items, groups } = stream({
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one', 'two'],
          executionMode: 'dynamic',
          orchestrationOutcome: 'done',
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          completedAt: localIso({ day: 18, hour: 10, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:run:run-1');
    const runRow = items.find((item) => item.id === 'run:run-1');

    expect(lane?.shape).toBe('merged');
    expect(runRow?.kind === 'row' ? runRow.markerState : null).toBe('done');
  });

  it('keeps the lane of a static run open while planned steps are still unspawned', () => {
    const { groups } = stream({
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one', 'two', 'three'],
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:run:run-1');

    expect(lane?.shape).toBe('open');
  });

  it('closes the lane of a static run when every planned step has settled', () => {
    const { groups } = stream({
      workflows: [
        attachedWorkflow({
          createdAt: localIso({ day: 18, hour: 8 }),
          stepIds: ['one', 'two'],
        }),
      ],
      agents: [
        agent({
          id: 'one',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
        agent({
          id: 'two',
          ordinal: 2,
          startedAt: localIso({ day: 18, hour: 10 }),
          completedAt: localIso({ day: 18, hour: 10, minute: 30 }),
          workflowRunId: RUN_ID,
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:run:run-1');

    expect(lane?.shape).toBe('merged');
  });

  it('keeps a parent agent group open while the parent still runs over settled children', () => {
    const { groups } = stream({
      agents: [
        agent({
          id: 'parent',
          ordinal: 1,
          status: 'running',
          startedAt: localIso({ day: 18, hour: 9 }),
        }),
        agent({
          id: 'child',
          ordinal: 2,
          parentAgentId: 'parent',
          startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 40 }),
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:agent:parent');

    expect(lane?.shape).toBe('open');
  });

  it('closes a parent agent group only when parent and children have all settled', () => {
    const { groups } = stream({
      agents: [
        agent({
          id: 'parent',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          completedAt: localIso({ day: 18, hour: 10 }),
        }),
        agent({
          id: 'child',
          ordinal: 2,
          parentAgentId: 'parent',
          startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
          completedAt: localIso({ day: 18, hour: 9, minute: 40 }),
        }),
      ],
    });
    const lane = groups.find((group) => group.id === 'lane:agent:parent');

    expect(lane?.shape).toBe('merged');
  });

  it('gives a chained agent group a colored lane', () => {
    const result = stream({
      agents: [
        agent({ id: 'planner', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) }),
        agent({
          id: 'implementer',
          ordinal: 1,
          parentAgentId: 'planner',
          startedAt: localIso({ day: 18, hour: 10 }),
        }),
      ],
    });

    expect(result.groups.map((group) => group.identityIndex)).toEqual([expect.any(Number)]);
  });
});

describe('buildTimelineStream, subagent collapse', () => {
  const FAN_OUT: ReadonlyArray<Agent> = [
    agent({
      id: 'implement',
      ordinal: 1,
      startedAt: localIso({ day: 18, hour: 9 }),
      workflowRunId: RUN_ID,
    }),
    agent({
      id: 'sub-a',
      ordinal: 2,
      parentAgentId: 'implement',
      startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
    }),
    agent({
      id: 'sub-a-a',
      ordinal: 3,
      parentAgentId: 'sub-a',
      startedAt: localIso({ day: 18, hour: 9, minute: 20 }),
    }),
    agent({ id: 'cluster-parent', ordinal: 4, startedAt: localIso({ day: 18, hour: 10 }) }),
    agent({
      id: 'cluster-child',
      ordinal: 5,
      parentAgentId: 'cluster-parent',
      startedAt: localIso({ day: 18, hour: 10, minute: 10 }),
    }),
  ];

  const FAN_OUT_WORKFLOWS = [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })];

  it('drops workflow descendants but keeps steps when workflow subagents are off', () => {
    const { items } = stream({
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
      showWorkflowSubagents: false,
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:cluster-child',
      'entry:agent:cluster-parent',
      'step:agent:implement',
      'entry:run:run-1',
    ]);
  });

  it('drops standalone descendants but keeps the parent when agent subagents are off', () => {
    const { items } = stream({
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
      showAgentSubagents: false,
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'entry:agent:cluster-parent',
      'step:agent:sub-a-a',
      'step:agent:sub-a',
      'step:agent:implement',
      'entry:run:run-1',
    ]);
  });

  it('emits no lane for a collapsed brood, so the rail carries no empty group', () => {
    const { items, groups } = stream({
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
      showWorkflowSubagents: false,
      showAgentSubagents: false,
    });
    const layout = layoutTimelineRail({ rows: items, groups });

    expect(items.map(labelOf)).toEqual([
      'now',
      'entry:agent:cluster-parent',
      'step:agent:implement',
      'entry:run:run-1',
    ]);
    expect(groups.map((group) => group.id)).toEqual(['lane:run:run-1']);
    for (const group of groups) {
      expect(items.some((item) => item.groupId === group.id)).toBe(true);
    }
    expect(layout.columnByGroupId.get('lane:agent:implement')).toBeUndefined();
    expect(layout.columnByGroupId.get('lane:agent:cluster-parent')).toBeUndefined();
  });

  it('moves a hidden child unread onto the parent row', () => {
    const collapsed = stream({
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
      unreadAgentIds: new Set(['sub-a-a', 'cluster-child']),
      showWorkflowSubagents: false,
      showAgentSubagents: false,
    });
    const unreadIds = collapsed.items.flatMap((item) =>
      item.kind === 'row' && item.hasUnread ? [item.id] : [],
    );

    expect(unreadIds).toEqual(expect.arrayContaining(['agent:implement', 'agent:cluster-parent']));
  });

  it('leaves the unread on the child row itself while subagents are shown', () => {
    const expanded = stream({
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
      unreadAgentIds: new Set(['sub-a-a']),
    });
    const unreadIds = expanded.items.flatMap((item) =>
      item.kind === 'row' && item.hasUnread ? [item.id] : [],
    );

    expect(unreadIds).toEqual(['agent:sub-a-a']);
  });

  it('matches the default stream exactly when both flags are on', () => {
    const params = {
      workflows: FAN_OUT_WORKFLOWS,
      agents: FAN_OUT,
    };

    expect(stream({ ...params, showWorkflowSubagents: true, showAgentSubagents: true })).toEqual(
      stream(params),
    );
  });
});

describe('buildTimelineStream, plan visibility and family anchoring', () => {
  const runPlan: PlanWithCount = {
    id: typedString<PlanId>({ value: 'plan-1' }),
    sessionId: SESSION_ID,
    agentId: typedString<AgentId>({ value: 'plan' }),
    workflowRunId: RUN_ID,
    title: 'migration plan',
    bodyMd: '',
    status: 'active',
    createdAt: typedString<IsoDateTime>({ value: localIso({ day: 18, hour: 9, minute: 15 }) }),
    updatedAt: typedString<IsoDateTime>({ value: localIso({ day: 18, hour: 9, minute: 15 }) }),
    consumptionCount: 0,
  };

  const PLAN_RUN_AGENTS: ReadonlyArray<Agent> = [
    agent({
      id: 'plan',
      ordinal: 1,
      startedAt: localIso({ day: 18, hour: 9 }),
      completedAt: localIso({ day: 18, hour: 9, minute: 30 }),
      workflowRunId: RUN_ID,
    }),
  ];

  const PLAN_RUN_WORKFLOWS = [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })];

  type StandalonePlanParams = {
    readonly id: string;
    readonly agentId: string;
  };

  const standalonePlan = ({ id, agentId }: StandalonePlanParams): PlanWithCount => ({
    id: typedString<PlanId>({ value: id }),
    sessionId: SESSION_ID,
    agentId: typedString<AgentId>({ value: agentId }),
    title: id,
    bodyMd: '',
    status: 'active',
    createdAt: typedString<IsoDateTime>({ value: localIso({ day: 18, hour: 9, minute: 15 }) }),
    updatedAt: typedString<IsoDateTime>({ value: localIso({ day: 18, hour: 9, minute: 15 }) }),
    consumptionCount: 0,
  });

  it('joins plans authored by a chain root and child to the root lane', () => {
    const { items } = stream({
      agents: [
        agent({ id: 'planner', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) }),
        agent({
          id: 'implementer',
          ordinal: 1,
          parentAgentId: 'planner',
          startedAt: localIso({ day: 18, hour: 10 }),
        }),
      ],
      plans: [
        standalonePlan({ id: 'root-plan', agentId: 'planner' }),
        standalonePlan({ id: 'child-plan', agentId: 'implementer' }),
      ],
    });
    const root = items.find((item) => item.kind === 'row' && item.id === 'agent:planner');
    const planRows = items.filter(
      (item) =>
        item.kind === 'row' && (item.id === 'plan:root-plan' || item.id === 'plan:child-plan'),
    );

    expect(planRows.map((item) => item.groupId)).toEqual([
      'lane:agent:planner',
      'lane:agent:planner',
    ]);
    expect(planRows.map((item) => (item.kind === 'row' ? item.identity : null))).toEqual([
      root?.kind === 'row' ? root.identity : null,
      root?.kind === 'row' ? root.identity : null,
    ]);
  });

  it('keeps a plan authored outside a chain on the spine', () => {
    const { items } = stream({
      agents: [agent({ id: 'solo', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) })],
      plans: [standalonePlan({ id: 'solo-plan', agentId: 'solo' })],
    });
    const planRow = items.find((item) => item.kind === 'row' && item.id === 'plan:solo-plan');

    expect(planRow?.groupId).toBeNull();
    expect(planRow?.kind === 'row' ? planRow.identity : 'missing').toBeNull();
  });

  it('keeps a run plan in the stream by default', () => {
    const { items } = stream({
      workflows: PLAN_RUN_WORKFLOWS,
      agents: PLAN_RUN_AGENTS,
      plans: [runPlan],
    });

    expect(items.map(labelOf)).toContain('step:plan:plan-1');
  });

  it('drops a run plan from the stream when plans are hidden', () => {
    const { items } = stream({
      workflows: PLAN_RUN_WORKFLOWS,
      agents: PLAN_RUN_AGENTS,
      plans: [runPlan],
      showPlans: false,
    });

    expect(items.map(labelOf)).not.toContain('step:plan:plan-1');
    expect(items.map(labelOf)).toContain('step:agent:plan');
  });

  const answeredQuestion: OpenQuestion = {
    id: typedString<OpenQuestionId>({ value: 'question-1' }),
    sessionId: SESSION_ID,
    createdByAgentId: typedString<AgentId>({ value: 'asker' }),
    text: 'Which auth flow should the migration keep?',
    suggestedAnswers: [],
    userAnswer: 'the oauth one',
    status: 'answered',
    createdAt: localIso({ day: 18, hour: 9 }) as IsoDateTime,
    answeredAt: localIso({ day: 18, hour: 10 }) as IsoDateTime,
  };

  const ASKER_AGENTS: ReadonlyArray<Agent> = [
    agent({
      id: 'asker',
      ordinal: 1,
      startedAt: localIso({ day: 18, hour: 8 }),
      completedAt: localIso({ day: 18, hour: 11 }),
    }),
  ];

  it('keeps an answered question in the stream by default', () => {
    const { items } = stream({ agents: ASKER_AGENTS, questions: [answeredQuestion] });

    expect(items.map(labelOf)).toContain('entry:question:question-1');
  });

  it('drops answered questions from the stream when questions are hidden', () => {
    const { items } = stream({
      agents: ASKER_AGENTS,
      questions: [answeredQuestion],
      showQuestions: false,
    });

    expect(items.map(labelOf)).not.toContain('entry:question:question-1');
    expect(items.map(labelOf)).toContain('entry:agent:asker');
  });

  const CLUSTER_RUN_AGENTS: ReadonlyArray<Agent> = [
    agent({
      id: 'implement',
      ordinal: 1,
      status: 'pending',
      startedAt: localIso({ day: 18, hour: 9 }),
      workflowRunId: RUN_ID,
    }),
    agent({
      id: 'sub-1',
      ordinal: 2,
      parentAgentId: 'implement',
      startedAt: localIso({ day: 18, hour: 9, minute: 10 }),
    }),
    agent({
      id: 'sub-2',
      ordinal: 3,
      parentAgentId: 'implement',
      startedAt: localIso({ day: 18, hour: 9, minute: 20 }),
    }),
    agent({ id: 'sub-3', ordinal: 4, status: 'pending', parentAgentId: 'implement' }),
    agent({ id: 'review', ordinal: 5, status: 'pending', workflowRunId: RUN_ID }),
  ];

  it('places every waiting family row above the newest dated family row', () => {
    const { items } = stream({
      workflows: PLAN_RUN_WORKFLOWS,
      agents: CLUSTER_RUN_AGENTS,
    });

    expect(items.map(labelOf)).toEqual([
      'now',
      'step:agent:review',
      'step:agent:sub-3',
      'step:agent:implement',
      'step:agent:sub-2',
      'step:agent:sub-1',
      'entry:run:run-1',
    ]);
  });

  it('gives an anchored pending subagent no clock of its own', () => {
    const { items } = stream({
      workflows: PLAN_RUN_WORKFLOWS,
      agents: CLUSTER_RUN_AGENTS,
    });
    const pendingChild = items.find((item) => item.id === 'agent:sub-3');

    expect(pendingChild?.kind === 'row' ? pendingChild.at : 'missing').toBeNull();
  });
});

describe('buildTimelineStream, question artifact rows', () => {
  type QuestionFixtureParams = {
    readonly id: string;
    readonly createdByAgentId?: string;
    readonly createdAt: string;
  };

  const openQuestionFor = ({
    id,
    createdByAgentId,
    createdAt,
  }: QuestionFixtureParams): OpenQuestion => ({
    id: typedString<OpenQuestionId>({ value: id }),
    sessionId: SESSION_ID,
    ...(createdByAgentId != null
      ? { createdByAgentId: typedString<AgentId>({ value: createdByAgentId }) }
      : {}),
    text: id,
    suggestedAnswers: [],
    userAnswer: null,
    status: 'open',
    createdAt: typedString<IsoDateTime>({ value: createdAt }),
  });

  const answeredQuestionFor = ({
    id,
    createdByAgentId,
    createdAt,
    answeredAt,
  }: QuestionFixtureParams & { readonly answeredAt: string }): OpenQuestion => ({
    ...openQuestionFor({ id, createdByAgentId, createdAt }),
    status: 'answered',
    userAnswer: 'yes',
    answeredAt: typedString<IsoDateTime>({ value: answeredAt }),
  });

  const CHAIN_AGENTS: ReadonlyArray<Agent> = [
    agent({ id: 'planner', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) }),
    agent({
      id: 'implementer',
      ordinal: 1,
      parentAgentId: 'planner',
      startedAt: localIso({ day: 18, hour: 10 }),
    }),
  ];

  it('lands a chain-root-authored question in the root lane, same as a plan artifact', () => {
    const { items } = stream({
      agents: CHAIN_AGENTS,
      questions: [
        openQuestionFor({
          id: 'root-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11 }),
        }),
      ],
    });
    const root = items.find((item) => item.kind === 'row' && item.id === 'agent:planner');
    const questionRow = items.find(
      (item) => item.kind === 'row' && item.id === 'question:root-question',
    );

    expect(questionRow?.groupId).toBe('lane:agent:planner');
    expect(questionRow?.kind === 'row' ? questionRow.identity : null).toEqual(
      root?.kind === 'row' ? root.identity : null,
    );
  });

  it('bubbles a question authored by a descendant up to the chain root lane', () => {
    const { items } = stream({
      agents: CHAIN_AGENTS,
      questions: [
        openQuestionFor({
          id: 'child-question',
          createdByAgentId: 'implementer',
          createdAt: localIso({ day: 18, hour: 11 }),
        }),
      ],
    });
    const questionRow = items.find(
      (item) => item.kind === 'row' && item.id === 'question:child-question',
    );

    expect(questionRow?.groupId).toBe('lane:agent:planner');
  });

  it('lands a run-step-authored question in the run lane', () => {
    const { items } = stream({
      workflows: [attachedWorkflow({ createdAt: localIso({ day: 18, hour: 8 }) })],
      agents: [
        agent({
          id: 'implement',
          ordinal: 1,
          startedAt: localIso({ day: 18, hour: 9 }),
          workflowRunId: RUN_ID,
        }),
      ],
      questions: [
        answeredQuestionFor({
          id: 'run-question',
          createdByAgentId: 'implement',
          createdAt: localIso({ day: 18, hour: 9, minute: 30 }),
          answeredAt: localIso({ day: 18, hour: 9, minute: 45 }),
        }),
      ],
    });
    const run = items.find((item) => item.kind === 'row' && item.id === 'run:run-1');
    const questionRow = items.find(
      (item) => item.kind === 'row' && item.id === 'question:run-question',
    );

    expect(questionRow?.groupId).toBe('lane:run:run-1');
    expect(questionRow?.kind === 'row' ? questionRow.identity : null).toEqual(
      run?.kind === 'row' ? run.identity : null,
    );
  });

  it('keeps a question with no resolvable author on the spine', () => {
    const { items } = stream({
      agents: [agent({ id: 'unrelated', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) })],
      questions: [
        openQuestionFor({ id: 'orphan-question', createdAt: localIso({ day: 18, hour: 11 }) }),
      ],
    });
    const questionRow = items.find(
      (item) => item.kind === 'row' && item.id === 'question:orphan-question',
    );

    expect(questionRow?.groupId).toBeNull();
    expect(questionRow?.kind === 'row' ? questionRow.identity : 'missing').toBeNull();
  });

  it('coalesces consecutive open questions from the same lane into one row', () => {
    const { items } = stream({
      agents: CHAIN_AGENTS,
      questions: [
        openQuestionFor({
          id: 'first-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11 }),
        }),
        openQuestionFor({
          id: 'second-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11, minute: 30 }),
        }),
      ],
    });
    const questionRows = items.filter(
      (item) => item.kind === 'row' && item.entry.kind === 'question',
    );
    const [row] = questionRows;

    expect(questionRows).toHaveLength(1);
    expect(
      row?.kind === 'row' && row.entry.kind === 'question' ? row.entry.questions.length : 0,
    ).toBe(2);
  });

  it('keeps an open cluster and a consumed cluster from the same lane on separate rows', () => {
    const { items } = stream({
      agents: CHAIN_AGENTS,
      questions: [
        openQuestionFor({
          id: 'open-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11 }),
        }),
        answeredQuestionFor({
          id: 'answered-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11, minute: 15 }),
          answeredAt: localIso({ day: 18, hour: 11, minute: 20 }),
        }),
      ],
    });
    const questionRows = items.filter(
      (item) => item.kind === 'row' && item.entry.kind === 'question',
    );

    expect(questionRows).toHaveLength(2);
  });

  it('breaks the coalesced run when another row lands between two questions', () => {
    const { items } = stream({
      agents: [
        agent({ id: 'planner', ordinal: 0, startedAt: localIso({ day: 18, hour: 9 }) }),
        agent({
          id: 'implementer',
          ordinal: 1,
          parentAgentId: 'planner',
          startedAt: localIso({ day: 18, hour: 12 }),
        }),
      ],
      questions: [
        openQuestionFor({
          id: 'first-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 11 }),
        }),
        openQuestionFor({
          id: 'second-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 13 }),
        }),
      ],
    });
    const questionRows = items.filter(
      (item) => item.kind === 'row' && item.entry.kind === 'question',
    );

    expect(questionRows).toHaveLength(2);
  });

  it('breaks the coalesced run across a day boundary', () => {
    const { items } = stream({
      agents: [
        agent({ id: 'planner', ordinal: 0, startedAt: localIso({ day: 17, hour: 9 }) }),
        agent({
          id: 'implementer',
          ordinal: 1,
          parentAgentId: 'planner',
          startedAt: localIso({ day: 17, hour: 10 }),
        }),
      ],
      questions: [
        openQuestionFor({
          id: 'yesterday-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 17, hour: 23 }),
        }),
        openQuestionFor({
          id: 'today-question',
          createdByAgentId: 'planner',
          createdAt: localIso({ day: 18, hour: 1 }),
        }),
      ],
    });
    const questionRows = items.filter(
      (item) => item.kind === 'row' && item.entry.kind === 'question',
    );

    expect(questionRows).toHaveLength(2);
  });
});

describe('buildTimelineStream, project mount runs', () => {
  const projectRunOf = (item: TimelineStreamItem | undefined) => {
    if (item === undefined || item.kind !== 'row' || item.entry.kind !== 'event') {
      return null;
    }
    return item.entry.projectRun ?? null;
  };

  const rowsOf = (items: ReadonlyArray<TimelineStreamItem>) =>
    items.flatMap((item) => (item.kind === 'row' ? [item] : []));

  it('collapses a run of detachments into one row that keeps every name', () => {
    const { items } = stream({
      agents: [],
      events: ['api', 'app-web', 'infra'].map((projectName, index) =>
        sessionEvent({
          id: `ev-${projectName}`,
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10, minute: index }),
          payload: { projectName },
        }),
      ),
    });
    const rows = rowsOf(items);

    expect(rows).toHaveLength(1);
    expect(projectRunOf(rows[0])).toEqual({
      mounted: [],
      detached: ['infra', 'app-web', 'api'],
    });
  });

  it('carries both verbs on one row when a run mixes them', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_materialized',
          at: localIso({ day: 18, hour: 10, minute: 1 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-app-web',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10, minute: 2 }),
          payload: { projectName: 'app-web' },
        }),
        sessionEvent({
          id: 'ev-infra',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10, minute: 3 }),
          payload: { projectName: 'infra' },
        }),
      ],
    });
    const rows = rowsOf(items);

    expect(rows).toHaveLength(1);
    expect(projectRunOf(rows[0])).toEqual({
      mounted: ['api'],
      detached: ['infra', 'app-web'],
    });
  });

  it('reads a mixed run as a mount, so it opens the files lens like a mount does', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_materialized',
          at: localIso({ day: 18, hour: 10, minute: 1 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-app-web',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10, minute: 2 }),
          payload: { projectName: 'app-web' },
        }),
      ],
    });
    const row = rowsOf(items)[0];

    expect(row?.entry.kind === 'event' ? row.entry.event.kind : null).toBe('project_materialized');
  });

  it('leaves a run of detachments a detachment, which navigates nowhere', () => {
    const { items } = stream({
      agents: [],
      events: ['api', 'app-web'].map((projectName, index) =>
        sessionEvent({
          id: `ev-${projectName}`,
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10, minute: index }),
          payload: { projectName },
        }),
      ),
    });
    const row = rowsOf(items)[0];

    expect(row?.entry.kind === 'event' ? row.entry.event.kind : null).toBe('project_detached');
  });

  it('stamps the collapsed row with the newest event in the run', () => {
    const newestAt = localIso({ day: 18, hour: 11, minute: 30 });
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-app-web',
          kind: 'project_detached',
          at: newestAt,
          payload: { projectName: 'app-web' },
        }),
      ],
    });
    const row = rowsOf(items)[0];

    expect(row?.at).toBe(newestAt);
    expect(row?.id).toBe('event:ev-app-web');
  });

  it('keeps two mounts apart when another kind of event sits between them', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_materialized',
          at: localIso({ day: 18, hour: 10 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-pr',
          kind: 'pr_created',
          at: localIso({ day: 18, hour: 11 }),
          payload: { number: 42 },
        }),
        sessionEvent({
          id: 'ev-app-web',
          kind: 'project_materialized',
          at: localIso({ day: 18, hour: 12 }),
          payload: { projectName: 'app-web' },
        }),
      ],
    });
    const rows = rowsOf(items);

    expect(rows.map((row) => row.id)).toEqual(['event:ev-app-web', 'event:ev-pr', 'event:ev-api']);
    expect(rows.every((row) => projectRunOf(row) == null)).toBe(true);
  });

  it('keeps mount runs apart across a day boundary', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_detached',
          at: localIso({ day: 17, hour: 23 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-app-web',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 1 }),
          payload: { projectName: 'app-web' },
        }),
      ],
    });
    const rows = rowsOf(items);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => projectRunOf(row) == null)).toBe(true);
  });

  it('leaves a single mount exactly as it was', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_materialized',
          at: localIso({ day: 18, hour: 10 }),
          payload: { projectName: 'api', branch: 'goodboy/untitled' },
        }),
      ],
    });
    const rows = rowsOf(items);
    const row = rows[0];

    expect(rows).toHaveLength(1);
    expect(projectRunOf(row)).toBeNull();
    expect(row?.entry.kind === 'event' ? row.entry.event.payload : null).toEqual({
      projectName: 'api',
      branch: 'goodboy/untitled',
    });
  });

  it('leaves a nameless detachment on its own row, where the old copy still fits', () => {
    const { items } = stream({
      agents: [],
      events: [
        sessionEvent({
          id: 'ev-api',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 10 }),
          payload: { projectName: 'api' },
        }),
        sessionEvent({
          id: 'ev-nameless',
          kind: 'project_detached',
          at: localIso({ day: 18, hour: 11 }),
        }),
      ],
    });
    const rows = rowsOf(items);

    expect(rows.map((row) => row.id)).toEqual(['event:ev-nameless', 'event:ev-api']);
    expect(rows.every((row) => projectRunOf(row) == null)).toBe(true);
  });
});
