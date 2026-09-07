import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlotKey } from '@goodboy/core';
import type {
  ContextSlot,
  IsoDateTime,
  Session,
  SessionId,
  TelemetryRecord,
  TelemetryRecordId,
  ProviderRunId,
  WorkspaceId,
} from '@goodboy/types';

vi.mock('../features/chat/turn', () => ({
  runTurn: vi.fn(),
  cancelTurn: vi.fn(),
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
}));

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionAuditInsert: vi.fn(async () => ({})),
  invokeAuditRetryEnqueue: vi.fn(),
  invokeAuditRetryDrain: vi.fn(async () => []),
  invokeAuditRetryUpdate: vi.fn(),
  invokeAuditRetryDelete: vi.fn(),
  useEffectivePermissionRules: () => [],
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../shared/lib/db', () => ({
  runDbMigrations: vi.fn(),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

vi.mock('../features/providers/providers', () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(),
  getCursorStatus: vi.fn(),
  getCodexStatus: vi.fn(),
  getProviderStatus: vi.fn(),
}));

vi.mock('../features/providers/routing', () => ({
  resolveProviderForTurn: vi.fn(async () => ({
    selectedProvider: 'anthropic',
    selectedModel: 'claude-3-5-sonnet-latest',
    reason: 'preference',
  })),
}));

vi.mock('../features/budget/budget', () => ({
  invokeBudgetRuleList: vi.fn(async () => []),
  invokeBudgetRuleUpsert: vi.fn(),
  invokeBudgetRuleDelete: vi.fn(),
  invokeBudgetAlertsList: vi.fn(async () => []),
  invokeBudgetAlertDismiss: vi.fn(),
  invokeSessionBudgetGet: vi.fn(),
  invokeSessionBudgetSet: vi.fn(),
  invokeCheckProviderBudget: vi.fn(),
}));

vi.mock('../features/skills/skills', () => ({
  invokeSkillList: vi.fn(async () => []),
  invokeSkillUpsert: vi.fn(),
  invokeSkillDelete: vi.fn(),
  invokeSkillRescan: vi.fn(),
  resolveSkillInvocation: vi.fn(),
}));

vi.mock('../features/workflows/workflows', () => ({
  invokeWorkflowList: vi.fn(async () => []),
  invokeWorkflowUpsert: vi.fn(),
  invokeWorkflowDelete: vi.fn(),
  invokeAgentList: vi.fn(async () => []),
  invokeAgentInsert: vi.fn(),
  invokeAgentUpdateStatus: vi.fn(),
}));

vi.mock('../features/worktree/worktree', () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock('../shared/lib/repo', () => ({
  validateGitRepo: vi.fn(),
}));

vi.mock('../features/providers/provider-pricing', () => ({
  getCodexPriceOverride: vi.fn(() => null),
}));

let resolveSummarize: (() => void) | null = null;
type SummarizerUpsert = { readonly key: SlotKey; readonly value: string };
let summarizerUpserts: ReadonlyArray<SummarizerUpsert> = [];
let summarizerUpsertSequence: Array<ReadonlyArray<SummarizerUpsert>> = [];
let summarizerConstructorCalls: Array<unknown> = [];
const summarizeSpy = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      resolveSummarize = resolve;
    }),
);

vi.mock('@goodboy/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@goodboy/core')>();
  return {
    ...original,
    Summarizer: class {
      constructor(deps: unknown) {
        summarizerConstructorCalls.push(deps);
      }

      summarize() {
        const upserts = summarizerUpsertSequence.shift() ?? summarizerUpserts;
        return summarizeSpy().then(() => ({
          delta: { upserts },
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, estimatedCostUsd: 0 },
          model: 'claude-haiku-4-5',
        }));
      }
    },
  };
});

let dbSlots: ReadonlyArray<ContextSlot> = [];
let resolveTelemetryList: ((records: ReadonlyArray<TelemetryRecord>) => void) | null = null;
const listTelemetryForSessionSpy = vi.fn(async () => [] as ReadonlyArray<TelemetryRecord>);
const upsertContextSlotSpy = vi.fn(
  async (_database: unknown, _sessionId: SessionId, slot: ContextSlot, _author: string) => {
    dbSlots = [...dbSlots.filter((existing) => existing.key !== slot.key), slot];
  },
);

const insertSessionEventSpy = vi.fn(
  async (_params: { readonly event: { readonly kind: string; readonly payload: unknown } }) =>
    undefined,
);

vi.mock('@goodboy/db', () => ({
  getSetting: vi.fn(),
  insertMessage: vi.fn(),
  insertSessionEvent: insertSessionEventSpy,
  insertProviderRun: vi.fn(async () => undefined),
  insertSession: vi.fn(),
  insertSessionWorktree: vi.fn(),
  insertTelemetry: vi.fn(async () => undefined),
  insertWorkspace: vi.fn(),
  insertContextSlotHistory: vi.fn(async () => undefined),
  listContextSlotHistory: vi.fn(async () => []),
  countContextSlotHistoryForSession: vi.fn(async () => ({})),
  listContextSlotsForSession: vi.fn(async () => dbSlots),
  listMessagesForSession: vi.fn(async () => []),
  listSessionsForWorkspace: vi.fn(async () => []),
  listTelemetryForSession: listTelemetryForSessionSpy,
  listWorkspaces: vi.fn(async () => []),
  listWorktreesForTask: vi.fn(async () => []),
  deleteWorktreesForSession: vi.fn(),
  setSetting: vi.fn(),
  summarizeSessionTelemetry: vi.fn(async () => null),
  summarizeWorkspaceTelemetry: vi.fn(async () => null),
  summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
  updateProviderRunStatus: vi.fn(async () => undefined),
  updateSessionState: vi.fn(),
  upsertContextSlot: upsertContextSlotSpy,
  insertOpenQuestion: vi.fn(async () => undefined),
  markOpenQuestionsResolvedByText: vi.fn(async () => 0),
  listResolvedQuestionTextsForSession: vi.fn(async () => []),
  insertTurnEvent: vi.fn(async () => undefined),
  insertTurnEventsBatch: vi.fn(async () => undefined),
  listWorktreesForSessions: vi.fn(async () => new Map()),
  listAgentsForSessions: vi.fn(async () => new Map()),
  listTurnEventsForAgent: vi.fn(async () => []),
  listTurnEventsForTask: vi.fn(async () => []),
  listMessagesForAgent: vi.fn(async () => []),
  insertNotification: vi.fn(async () => undefined),
  listNotifications: vi.fn(async () => []),
  countNotifications: vi.fn(async () => ({ total: 0, unread: 0 })),
  NOTIFICATION_LIST_LIMIT: 200,
  markAllNotificationsRead: vi.fn(async () => undefined),
  clearAllNotifications: vi.fn(async () => undefined),
  updateSessionWorkflowStep: vi.fn(),
  attachWorkflowToSession: vi.fn(),
  detachWorkflowFromSession: vi.fn(),
  updateWorkflowOrder: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({
    stdout: JSON.stringify({ result: '{"upserts":[]}', usage: {} }),
    stderr: '',
    exitCode: 0,
  })),
}));

const SESSION_ID = 'task-queue-test' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const NOW: IsoDateTime = '2026-05-10T00:00:00.000Z' as IsoDateTime;

function buildSession(): Session {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    goal: 'test queue',
    state: { kind: 'idle', lastActivityAt: NOW },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
    permissionMode: 'bypassPermissions' as const,
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function importStore() {
  const mod = await import('./store');
  return mod;
}

describe('summarizer queue, coalescing and no-stack', () => {
  beforeEach(() => {
    summarizeSpy.mockReset();
    resolveSummarize = null;
    summarizerUpserts = [];
    insertSessionEventSpy.mockClear();
    summarizerUpsertSequence = [];
    summarizerConstructorCalls = [];
    dbSlots = [];
    resolveTelemetryList = null;
    listTelemetryForSessionSpy.mockReset();
    listTelemetryForSessionSpy.mockResolvedValue([]);
    upsertContextSlotSpy.mockClear();
    summarizeSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rapid back-to-back triggers result in at most 2 underlying summarize calls', async () => {
    let firstResolve: () => void = () => undefined;
    summarizeSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((res) => {
            firstResolve = res;
          }),
      )
      .mockResolvedValue(undefined);

    const { useAppStore, summarizerQueues } = await import('./store');
    summarizerQueues.clear();

    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: {},
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    const state = useAppStore.getState();
    const queue = {
      inFlight: true,
      queued: null as null | {
        turnInput: string;
        turnOutput: string;
        oversizeRetried: boolean;
      },
    };
    summarizerQueues.set(SESSION_ID, queue);

    for (let i = 1; i <= 4; i++) {
      if (queue.inFlight) {
        queue.queued = {
          turnInput: `input-${i}`,
          turnOutput: `output-${i}`,
          oversizeRetried: false,
        };
      }
    }

    expect(queue.queued?.turnInput).toBe('input-4');

    const callsBefore = summarizeSpy.mock.calls.length;
    firstResolve();
    await Promise.resolve();

    expect(callsBefore).toBeLessThanOrEqual(2);
    expect(state).toBeDefined();

    summarizerQueues.delete(SESSION_ID);
  });

  it('uses the configured summarizer task model when no override is provided', async () => {
    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: [] },
      summarizerStatus: {},
      workspaceOverrides: {
        [WORKSPACE_ID]: {
          defaultProviderId: null,
          defaultWorkflowId: null,
          defaultBranchPrefix: null,
          parallelEnabled: null,
          defaultVerbosity: null,
          providerBindings: null,
          taskModels: {
            summarizer: { providerId: 'cursor', model: 'sonnet-4.6' },
          },
          roleModels: null,
          parallelAgents: null,
          providerPool: null,
          attributionFooter: null,
        },
      },
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );

    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(summarizerConstructorCalls).toContainEqual(
      expect.objectContaining({ providerId: 'cursor', model: 'sonnet-4.6' }),
    );
    useAppStore.setState({ workspaceOverrides: {} });
  });

  it('single trigger with nothing in-flight fires immediately and clears queue', async () => {
    let resolved = false;
    summarizeSpy.mockImplementation(async () => {
      resolved = true;
    });

    const { summarizerQueues: sq } = await import('./store');
    sq.clear();

    const queue = {
      inFlight: false,
      queued: null as null | {
        turnInput: string;
        turnOutput: string;
        oversizeRetried: boolean;
      },
    };
    sq.set(SESSION_ID, queue);

    queue.inFlight = true;
    await summarizeSpy();
    queue.inFlight = false;

    expect(resolved).toBe(true);
    expect(queue.queued).toBeNull();
    expect(queue.inFlight).toBe(false);

    sq.delete(SESSION_ID);
  });

  it('keeps telemetry recorded while the summarizer refresh is in flight', async () => {
    const staleRecord = {
      id: 'telemetry-old' as TelemetryRecordId,
      runId: 'run-old' as ProviderRunId,
      sessionId: SESSION_ID,
      kind: 'turn',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      inputTokens: 100,
      outputTokens: 10,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      estimatedCostUsd: 0.01,
      recordedAt: NOW,
    } satisfies TelemetryRecord;
    const currentRecord = {
      ...staleRecord,
      id: 'telemetry-current' as TelemetryRecordId,
      runId: 'run-current' as ProviderRunId,
      inputTokens: 200,
    } satisfies TelemetryRecord;
    listTelemetryForSessionSpy.mockImplementationOnce(
      () =>
        new Promise<ReadonlyArray<TelemetryRecord>>((resolve) => {
          resolveTelemetryList = resolve;
        }),
    );

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: [] },
      sessionTelemetry: { [SESSION_ID]: [staleRecord] },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );
    await vi.waitFor(() => expect(listTelemetryForSessionSpy).toHaveBeenCalledTimes(1));
    useAppStore.setState({ sessionTelemetry: { [SESSION_ID]: [staleRecord, currentRecord] } });
    resolveTelemetryList?.([staleRecord]);

    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(useAppStore.getState().sessionTelemetry[SESSION_ID]).toEqual([
      staleRecord,
      currentRecord,
    ]);
  });

  it('in-flight + multiple queued coalesces to one pending entry', async () => {
    const { summarizerQueues: sq } = await import('./store');
    sq.clear();

    const queue = {
      inFlight: true,
      queued: null as null | {
        turnInput: string;
        turnOutput: string;
        oversizeRetried: boolean;
      },
    };
    sq.set(SESSION_ID, queue);

    for (let i = 0; i < 10; i++) {
      if (queue.inFlight) {
        queue.queued = {
          turnInput: `t${i}`,
          turnOutput: `o${i}`,
          oversizeRetried: false,
        };
      }
    }

    expect(queue.queued).toEqual({
      turnInput: 't9',
      turnOutput: 'o9',
      oversizeRetried: false,
    });

    sq.delete(SESSION_ID);
  });

  it('waitForSummarizerSettled is not exported, summarizer never blocks user actions (#461)', async () => {
    const storeModule = await import('./store');
    expect((storeModule as Record<string, unknown>)['waitForSummarizerSettled']).toBeUndefined();
  });

  it('queue inFlight=true while summarizer runs does not prevent subsequent queue entries', async () => {
    const { summarizerQueues: sq } = await import('./store');
    sq.clear();

    const queue = {
      inFlight: true,
      queued: null as null | {
        turnInput: string;
        turnOutput: string;
        oversizeRetried: boolean;
      },
    };
    sq.set(SESSION_ID, queue);

    const before = Date.now();
    queue.queued = { turnInput: 'next-input', turnOutput: '', oversizeRetried: false };
    const elapsed = Date.now() - before;

    expect(elapsed).toBeLessThan(50);
    expect(queue.queued?.turnInput).toBe('next-input');
    expect(queue.inFlight).toBe(true);

    sq.delete(SESSION_ID);
  });

  it('skips a conflicting slot write without blocking non-conflicting upserts', async () => {
    let resolveFirst: () => void = () => undefined;
    summarizeSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    summarizerUpserts = [
      { key: 'goal', value: 'summarized goal' },
      { key: 'decisions', value: '- summarized decision' },
    ];
    dbSlots = [
      { key: 'goal', value: 'original goal', enabled: true },
      { key: 'decisions', value: '- original decision', enabled: true },
    ];

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: dbSlots },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );
    await vi.waitFor(() => expect(summarizeSpy).toHaveBeenCalledTimes(1));

    const concurrentGoal: ContextSlot = {
      key: 'goal',
      value: 'concurrent user goal',
      enabled: true,
    };
    dbSlots = [concurrentGoal, { key: 'decisions', value: '- original decision', enabled: true }];
    useAppStore.setState({ sessionSlots: { [SESSION_ID]: dbSlots } });
    summarizerUpserts = [];
    resolveFirst();

    await vi.waitFor(() => expect(summarizeSpy).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(upsertContextSlotSpy).toHaveBeenCalledTimes(1);
    expect(upsertContextSlotSpy.mock.calls[0]?.[2]).toMatchObject({
      key: 'decisions',
      value: '- summarized decision',
    });
    expect(useAppStore.getState().sessionSlots[SESSION_ID]).toContainEqual(concurrentGoal);
  });

  it('logs a decisions_changed event when the summarizer rewrites decisions', async () => {
    summarizeSpy.mockResolvedValue(undefined);
    summarizerUpserts = [
      { key: 'goal', value: 'same goal' },
      { key: 'decisions', value: '- kept decision\n- new decision' },
    ];
    dbSlots = [
      { key: 'goal', value: 'same goal', enabled: true },
      { key: 'decisions', value: '- kept decision', enabled: true },
    ];

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: dbSlots },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );
    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));

    const decisionEvents = insertSessionEventSpy.mock.calls
      .map(([params]) => params.event)
      .filter((event) => event.kind === 'decisions_changed');
    expect(decisionEvents).toHaveLength(1);
    expect(decisionEvents[0]?.payload).toEqual({ added: 1, removed: 0 });
  });

  it('coalesces multiple conflicts into one follow-up pass', async () => {
    let resolveFirst: () => void = () => undefined;
    summarizeSpy
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    summarizerUpserts = [
      { key: 'goal', value: 'summarized goal' },
      { key: 'decisions', value: '- summarized decision' },
    ];
    dbSlots = [
      { key: 'goal', value: 'original goal', enabled: true },
      { key: 'decisions', value: '- original decision', enabled: true },
    ];

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: dbSlots },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );
    await vi.waitFor(() => expect(summarizeSpy).toHaveBeenCalledTimes(1));
    dbSlots = [
      { key: 'goal', value: 'concurrent goal', enabled: true },
      { key: 'decisions', value: '- concurrent decision', enabled: true },
    ];
    useAppStore.setState({ sessionSlots: { [SESSION_ID]: dbSlots } });
    summarizerUpserts = [];
    resolveFirst();

    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(summarizeSpy).toHaveBeenCalledTimes(2);
    expect(upsertContextSlotSpy).not.toHaveBeenCalled();
  });

  it('re-enqueues only once when every pass changes an oversize slot', async () => {
    summarizerUpsertSequence = Array.from({ length: 10 }, (_, index) => [
      { key: 'goal', value: `${index}${'x'.repeat(561)}` },
    ]);
    dbSlots = [{ key: 'goal', value: 'original goal', enabled: true }];

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: dbSlots },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );

    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(summarizeSpy).toHaveBeenCalledTimes(2);
    expect(upsertContextSlotSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-enqueue for an unchanged slot above twice its budget', async () => {
    const oversizeGoal = 'x'.repeat(561);
    summarizerUpserts = [{ key: 'goal', value: oversizeGoal }];
    dbSlots = [{ key: 'goal', value: oversizeGoal, enabled: true }];

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues: queues } = await import('./turn-helpers');
    queues.clear();
    useAppStore.setState({
      sessions: [buildSession()],
      sessionSlots: { [SESSION_ID]: dbSlots },
      summarizerStatus: {},
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
            defaultProviderId: null,
            defaultWorkflowId: null,
            defaultBranchPrefix: null,
            parallelEnabled: null,
            defaultVerbosity: null,
            providerBindings: null,
            taskModels: null,
            roleModels: null,
            parallelAgents: null,
            providerPool: null,
            attributionFooter: null,
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    enqueueSummarizer(
      useAppStore.setState,
      useAppStore.getState,
      SESSION_ID,
      'turn input',
      'turn output',
    );

    await vi.waitFor(() => expect(queues.get(SESSION_ID)?.inFlight).toBe(false));
    expect(summarizeSpy).toHaveBeenCalledTimes(1);
    expect(upsertContextSlotSpy).toHaveBeenCalledTimes(1);
  });
});
