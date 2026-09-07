import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  ImplementationCluster,
  IsoDateTime,
  PlanId,
  PlanWithCount,
  PrComment,
  PullRequestState,
  Session,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import {
  buildCombinedCommentAgentArgs,
  buildCommentAgentArgs,
} from '../../../features/chat/spawn-from-comment';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const {
  invokeAgentInsertSpy,
  invokeAgentListSpy,
  addPlanConsumptionSpy,
  listConsumptionsForPlanSpy,
  listPlansForSessionSpy,
  fanOutClustersSpy,
  updateAgentConfigSpy,
} = vi.hoisted(() => ({
  invokeAgentInsertSpy: vi.fn(),
  invokeAgentListSpy: vi.fn(async () => [] as ReadonlyArray<Agent>),
  addPlanConsumptionSpy: vi.fn(async () => undefined),
  listConsumptionsForPlanSpy: vi.fn(async () => []),
  listPlansForSessionSpy: vi.fn(async () => [] as ReadonlyArray<PlanWithCount>),
  fanOutClustersSpy: vi.fn(async () => undefined),
  updateAgentConfigSpy: vi.fn(async () => undefined),
}));

vi.mock('../../../features/workflows/workflows', () => ({
  invokeAgentInsert: invokeAgentInsertSpy,
  invokeAgentList: invokeAgentListSpy,
}));

vi.mock('../../../features/plans/plans', () => ({
  addPlanConsumption: addPlanConsumptionSpy,
  listConsumptionsForPlan: listConsumptionsForPlanSpy,
  listPlansForSession: listPlansForSessionSpy,
}));

vi.mock('@goodboy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/db')>();
  return { ...actual, updateAgentConfig: updateAgentConfigSpy };
});

vi.mock('../workflows/clusterImplementation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workflows/clusterImplementation')>();
  return { ...actual, fanOutClusters: fanOutClustersSpy };
});

import { spawnAgent } from './spawnAgent';
import { beginSessionCreation, endSessionCreation } from '../session-view/sessionCreation';
import type { SetFn } from '../../slice-types';

const WS_ID = 'ws-1' as WorkspaceId;
const SESSION_ID = 'ses-1' as SessionId;
const PLAN_ID = 'plan-1' as PlanId;
const INSERTED_ID = 'agent-new' as AgentId;
const NOW = '2026-06-12T00:00:00.000Z' as IsoDateTime;

const TWO_CLUSTERS: ReadonlyArray<ImplementationCluster> = [
  { title: 'a', instructions: 'i1' },
  { title: 'b', instructions: 'i2' },
];

const PR = {
  number: 9108,
  title: 'resolve: foo',
  url: 'https://github.com/o/r/pull/9108',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'kay/foo',
  isDraft: false,
  reviewDecision: 'changes_requested',
  body: '',
  updatedAt: '2026-05-15T00:00:00Z',
} satisfies PullRequestState;

const COMMENT = {
  id: 'review-1',
  author: 'alice',
  authorAvatarUrl: null,
  body: 'this should use a helper',
  createdAt: '2026-05-15T10:00:00Z',
  url: 'https://github.com/o/r/pull/9108#discussion_r1',
  source: 'review',
  path: 'src/foo.ts',
  line: 42,
  resolved: false,
  threadId: 'PRRT_7',
} satisfies PrComment;

function makePlan(overrides: Partial<PlanWithCount> = {}): PlanWithCount {
  return {
    id: PLAN_ID,
    sessionId: SESSION_ID,
    agentId: 'agent-planner' as AgentId,
    title: 'the plan',
    bodyMd: 'do the thing',
    status: 'active',
    consumptionCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildHarness(
  plans: ReadonlyArray<PlanWithCount>,
  sessionOverrides: Partial<Session> = {},
) {
  listPlansForSessionSpy.mockResolvedValue(plans);
  invokeAgentInsertSpy.mockResolvedValue({
    id: INSERTED_ID,
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'agent 1',
    status: 'pending',
    kind: 'implementer',
  } as Agent);
  invokeAgentListSpy.mockResolvedValue([]);

  const session: Session = {
    id: SESSION_ID,
    workspaceId: WS_ID,
    goal: 'g',
    state: { kind: 'idle', lastActivityAt: NOW },
    contextSlots: [],
    providerPreference: {
      defaultProvider: 'anthropic',
      allowTurnOverride: true,
    } as Session['providerPreference'],
    permissionMode: 'default' as Session['permissionMode'],
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...sessionOverrides,
  };
  const sendTurn = vi.fn(
    async (_arg: { sessionId: SessionId; agentId: AgentId; content: string }) => undefined,
  );
  const drainResolveQueue = vi.fn(async () => undefined);
  const recordResolveAttempt = vi.fn(
    async (_params: { phase: string; instructions: string | null }) => 'attempt-id',
  );
  const state = {
    recordResolveAttempt,
    drainResolveQueue,
    sessions: [session],
    phaseTemplates: { [WS_ID]: [] },
    sessionPhaseRuns: { [SESSION_ID]: [] },
    sessionPlans: { [SESSION_ID]: plans },
    planConsumptions: {},
    activeLens: { [SESSION_ID]: 'agents' },
    sessionStudio: { [SESSION_ID]: { kind: 'github' } },
    selectedAgentId: {},
    agentTurnState: {},
    workspaceOverrides: {
      [WS_ID]: {
        roleModels: {
          planner: {
            providerId: 'anthropic',
            model: 'claude-opus-5',
            effort: 'high',
          },
        },
      },
    },
    transcripts: {},
    messages: {},
    agentModelOverride: {},
    agentProviderOverride: {},
    agentEffortOverride: {},
    agentKindOverride: {},
    sessionCreations: {},
    sendTurn,
  };
  const get = (() => state) as unknown as Parameters<typeof spawnAgent>[1];
  const set = vi.fn((update: Parameters<Parameters<typeof spawnAgent>[0]>[0]) => {
    const patch = typeof update === 'function' ? update(get()) : update;
    Object.assign(state, patch);
  });
  Object.assign(state, {
    beginSessionCreation: beginSessionCreation(set as unknown as SetFn),
    endSessionCreation: endSessionCreation(set as unknown as SetFn),
  });
  return {
    getState: get,
    drainResolveQueue,
    recordResolveAttempt,
    sendTurn,
    spawn: spawnAgent(set, get),
  };
}

describe('spawnAgent focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConsumptionsForPlanSpy.mockResolvedValue([]);
  });

  it('leaves the current work surface alone when no focus is requested', async () => {
    const { getState, spawn } = buildHarness([]);

    await spawn(SESSION_ID, { name: 'quiet spawn' });

    expect(getState().selectedAgentId[SESSION_ID]).toBeUndefined();
    expect(getState().sessionStudio[SESSION_ID]).toEqual({ kind: 'github' });
  });

  it('routes an explicit focus through the work surface, closing the studio', async () => {
    const { getState, spawn } = buildHarness([]);

    await spawn(SESSION_ID, { name: 'loud spawn', focus: 'agent' });

    expect(getState().selectedAgentId[SESSION_ID]).toBe(INSERTED_ID);
    expect(getState().sessionStudio[SESSION_ID]).toBeNull();
  });

  it('clears the creation signal once the spawn settles', async () => {
    const { getState, spawn } = buildHarness([]);

    await spawn(SESSION_ID, { name: 'tracked spawn' });

    expect(getState().sessionCreations[SESSION_ID]).toEqual([]);
  });
});

describe('spawnAgent ad-hoc cluster fan-out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listConsumptionsForPlanSpy.mockResolvedValue([]);
  });

  it('persists an inferred kind when no override is provided', async () => {
    const { spawn } = buildHarness([]);

    await spawn(SESSION_ID, { name: 'debug startup crash' });

    expect(invokeAgentInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'debugger', name: 'debug startup crash' }),
    );
  });

  it('seeds routing overrides from the workspace role model', async () => {
    const { getState, spawn } = buildHarness([]);

    await spawn(SESSION_ID, { kindOverride: 'planner' });

    expect(getState().agentModelOverride[INSERTED_ID]).toBe('opus-5');
    expect(getState().agentProviderOverride[INSERTED_ID]).toBe('anthropic');
    expect(getState().agentEffortOverride[INSERTED_ID]).toBe('high');
  });

  it('keeps an explicit model while seeding omitted routing fields', async () => {
    const { getState, spawn } = buildHarness([]);

    await spawn(SESSION_ID, { kindOverride: 'planner', model: 'claude-sonnet-4-6' });

    expect(getState().agentModelOverride[INSERTED_ID]).toBe('claude-sonnet-4-6');
    expect(getState().agentProviderOverride[INSERTED_ID]).toBe('anthropic');
    expect(getState().agentEffortOverride[INSERTED_ID]).toBe('high');
  });

  it('writes the resolved routing onto the agent row and its db record', async () => {
    const { getState, spawn } = buildHarness([]);
    invokeAgentListSpy.mockResolvedValue([
      {
        id: INSERTED_ID,
        sessionId: SESSION_ID,
        ordinal: 0,
        name: 'agent 1',
        status: 'pending',
      } as Agent,
    ]);

    await spawn(SESSION_ID, { kindOverride: 'planner' });

    expect(getState().sessionPhaseRuns[SESSION_ID]?.[0]).toMatchObject({
      providerOverride: 'anthropic',
      modelOverride: 'opus-5',
      effort: 'high',
    });
    expect(updateAgentConfigSpy).toHaveBeenCalledWith(expect.anything(), INSERTED_ID, {
      providerOverride: 'anthropic',
      modelOverride: 'opus-5',
      effort: 'high',
    });
  });

  it('keeps the role default for a programmatic spawn even when the chat pins a model', async () => {
    const { getState, spawn } = buildHarness([], {
      providerOverride: 'anthropic',
      modelOverride: 'claude-opus-5',
      effort: 'high',
    });

    await spawn(SESSION_ID, { kindOverride: 'scout' });

    expect(getState().agentModelOverride[INSERTED_ID]).toBe('haiku-4.5');
    expect(getState().agentEffortOverride[INSERTED_ID]).toBe('low');
  });

  it('fans out an explicit (triggeredPlanId) plan with 2+ clusters', async () => {
    const { sendTurn, spawn } = buildHarness([makePlan({ clusters: TWO_CLUSTERS })]);

    await spawn(SESSION_ID, { triggeredPlanId: PLAN_ID, kindOverride: 'implementer' });

    expect(fanOutClustersSpy).toHaveBeenCalledTimes(1);
    expect(addPlanConsumptionSpy).toHaveBeenCalledWith(PLAN_ID, INSERTED_ID);
    expect(sendTurn).not.toHaveBeenCalled();
  });

  it('fans out the latest active plan with 2+ clusters (no triggeredPlanId)', async () => {
    const { sendTurn, spawn } = buildHarness([makePlan({ clusters: TWO_CLUSTERS })]);

    await spawn(SESSION_ID, { kindOverride: 'implementer' });

    expect(fanOutClustersSpy).toHaveBeenCalledTimes(1);
    expect(sendTurn).not.toHaveBeenCalled();
  });

  it('does not fan out a single-cluster plan (kicks off the implementer directly)', async () => {
    const { sendTurn, spawn } = buildHarness([
      makePlan({ clusters: [{ title: 'only', instructions: 'i' }] }),
    ]);

    await spawn(SESSION_ID, { triggeredPlanId: PLAN_ID, kindOverride: 'implementer' });

    expect(fanOutClustersSpy).not.toHaveBeenCalled();
    expect(sendTurn).toHaveBeenCalledTimes(1);
  });

  it('honors an explicit initialPrompt instead of fanning out', async () => {
    const { sendTurn, spawn } = buildHarness([makePlan({ clusters: TWO_CLUSTERS })]);

    await spawn(SESSION_ID, {
      kindOverride: 'implementer',
      initialPrompt: 'fix the typo in README',
    });

    expect(fanOutClustersSpy).not.toHaveBeenCalled();
    expect(sendTurn).toHaveBeenCalledTimes(1);
    expect(sendTurn.mock.calls[0]?.[0]?.content).toContain('fix the typo in README');
  });

  it('persists a queued request instead of sending the resolver kickoff itself', async () => {
    const { drainResolveQueue, recordResolveAttempt, sendTurn, spawn } = buildHarness([]);
    const args = buildCommentAgentArgs(COMMENT, PR, {
      hint: 'Avoid schema changes.',
    });

    await spawn(SESSION_ID, {
      kindOverride: 'resolver',
      initialPrompt: args.initialPrompt,
    });

    const request = recordResolveAttempt.mock.calls[0]?.[0];
    expect(request?.phase).toBe('queued');
    expect(request?.instructions).toContain('Judge the thread above on the merits in one pass.');
    expect(request?.instructions).toContain('Operator notes\nAvoid schema changes.');
    expect(sendTurn).not.toHaveBeenCalled();
    expect(drainResolveQueue).toHaveBeenCalledWith({ sessionId: SESSION_ID });
  });

  it('persists every combined source thread and the first compatibility thread', async () => {
    const { spawn } = buildHarness([]);
    const args = buildCombinedCommentAgentArgs(
      [
        { head: COMMENT, replies: [] },
        {
          head: {
            ...COMMENT,
            id: 'review-2',
            threadId: 'PRRT_8',
            url: 'https://github.com/o/r/pull/9108#discussion_r2',
          },
          replies: [],
        },
      ],
      PR,
    );

    await spawn(SESSION_ID, {
      kindOverride: 'resolver',
      initialPrompt: args.initialPrompt,
      sourceThreadIds: args.sourceThreadIds,
    });

    expect(invokeAgentInsertSpy).toHaveBeenCalledOnce();
    expect(invokeAgentInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceThreadId: 'PRRT_7',
        sourceThreadIds: ['PRRT_7', 'PRRT_8'],
      }),
    );
  });

  it('consumes the plan on ad-hoc fan-out so a re-spawn cannot fan out again', async () => {
    const { spawn } = buildHarness([makePlan({ clusters: TWO_CLUSTERS })]);

    await spawn(SESSION_ID, { kindOverride: 'implementer' });

    expect(fanOutClustersSpy).toHaveBeenCalledTimes(1);
    expect(addPlanConsumptionSpy).toHaveBeenCalledWith(PLAN_ID, INSERTED_ID);
  });

  it('fans out a plan with 2+ clusters even if status is not active', async () => {
    const { sendTurn, spawn } = buildHarness([
      makePlan({ clusters: TWO_CLUSTERS, status: 'superseded' }),
    ]);

    await spawn(SESSION_ID, { triggeredPlanId: PLAN_ID, kindOverride: 'implementer' });

    expect(fanOutClustersSpy).toHaveBeenCalledTimes(1);
    expect(sendTurn).not.toHaveBeenCalled();
  });

  it('fans out an earlier clustered plan when the latest-overall plan has no clusters', async () => {
    const CLUSTERED_ID = 'plan-clustered' as PlanId;
    const { sendTurn, spawn } = buildHarness([
      makePlan({ id: CLUSTERED_ID, clusters: TWO_CLUSTERS }),
      makePlan({ id: 'plan-latest' as PlanId, clusters: undefined, status: 'active' }),
    ]);

    await spawn(SESSION_ID, { kindOverride: 'implementer' });

    expect(fanOutClustersSpy).toHaveBeenCalledTimes(1);
    expect(sendTurn).not.toHaveBeenCalled();
  });
});
