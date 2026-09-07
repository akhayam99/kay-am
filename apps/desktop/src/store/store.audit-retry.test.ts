import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProjectId,
  Agent,
  AgentId,
  IsoDateTime,
  Session,
  SessionId,
  TurnEvent,
  WorkspaceId,
} from '@goodboy/types';

const runTurnSpy = vi.fn();
const cancelTurnSpy = vi.fn();

vi.mock('../features/chat/turn', () => ({
  runTurn: (args: unknown) => runTurnSpy(args),
  cancelTurn: cancelTurnSpy,
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
}));

const permissionRuleListSpy = vi.fn();
const permissionAuditInsertSpy = vi.fn();
const auditRetryEnqueueSpy = vi.fn();
const auditRetryDrainSpy = vi.fn();
const auditRetryUpdateSpy = vi.fn();
const auditRetryDeleteSpy = vi.fn();

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: (args: unknown) => permissionRuleListSpy(args),
  invokePermissionAuditInsert: (args: unknown) => permissionAuditInsertSpy(args),
  invokeAuditRetryEnqueue: (id: string, payload: string) => auditRetryEnqueueSpy(id, payload),
  invokeAuditRetryDrain: (limit: number) => auditRetryDrainSpy(limit),
  invokeAuditRetryUpdate: (id: string, attempts: number, err: string) =>
    auditRetryUpdateSpy(id, attempts, err),
  invokeAuditRetryDelete: (id: string) => auditRetryDeleteSpy(id),
  useEffectivePermissionRules: () => [],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../shared/lib/db', () => ({
  runDbMigrations: vi.fn(),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

vi.mock('@goodboy/db', () => ({
  getSetting: vi.fn(),
  insertMessage: vi.fn(),
  insertProviderRun: vi.fn(),
  insertSession: vi.fn(),
  insertSessionWorktree: vi.fn(),
  insertTelemetry: vi.fn(),
  insertWorkspace: vi.fn(),
  listContextSlotsForSession: vi.fn(async () => []),
  listMessagesForSession: vi.fn(async () => []),
  listSessionsForWorkspace: vi.fn(async () => []),
  listTelemetryForSession: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => []),
  listWorktreesForTask: vi.fn(async () => []),
  deleteWorktreesForSession: vi.fn(),
  setSetting: vi.fn(),
  summarizeSessionTelemetry: vi.fn(async () => null),
  summarizeWorkspaceTelemetry: vi.fn(async () => null),
  summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
  updateProviderRunStatus: vi.fn(),
  updateSessionState: vi.fn(),
  upsertContextSlot: vi.fn(),
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

vi.mock('../features/providers/providers', () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(),
  getCursorStatus: vi.fn(),
  getCodexStatus: vi.fn(),
  getGeminiStatus: vi.fn(),
  getOpenCodeStatus: vi.fn(async () => ({ state: 'missing' })),
  getOpenRouterStatus: vi.fn(async () => ({ state: 'missing' })),
  getMoonshotStatus: vi.fn(async () => ({ state: 'missing' })),
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

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const NOW: IsoDateTime = '2026-05-07T00:00:00.000Z' as IsoDateTime;

function buildSession(): Session {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    goal: 'test',
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

function makeRetryEntry(overrides: { id?: string; payloadJson?: string; attempts?: number }) {
  return {
    id: overrides.id ?? 'retry-1',
    payloadJson:
      overrides.payloadJson ??
      JSON.stringify({
        id: 'req-1',
        runId: 'run-1',
        sessionId: SESSION_ID,
        toolUseId: 'tu-1',
        toolName: 'Edit',
        inputJson: '{}',
        decision: 'allow',
        decidedBy: 'rule',
        requestedAt: NOW,
        decidedAt: NOW,
      }),
    attempts: overrides.attempts ?? 0,
    lastError: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function* emptyStream(): AsyncIterable<TurnEvent> {}

describe('audit retry queue, sendTurn enqueue on failure', () => {
  beforeEach(() => {
    runTurnSpy.mockReset();
    cancelTurnSpy.mockReset();
    permissionRuleListSpy.mockReset();
    permissionAuditInsertSpy.mockReset();
    auditRetryEnqueueSpy.mockReset();
    auditRetryDrainSpy.mockReset();
    auditRetryUpdateSpy.mockReset();
    auditRetryDeleteSpy.mockReset();

    permissionRuleListSpy.mockResolvedValue([]);
    auditRetryEnqueueSpy.mockResolvedValue(undefined);
    auditRetryDrainSpy.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function importStore() {
    const mod = await import('./store');
    return mod.useAppStore;
  }

  function setupSession(useAppStore: Awaited<ReturnType<typeof importStore>>) {
    const defaultAgent: Agent = {
      id: 'agent-1' as AgentId,
      sessionId: SESSION_ID,
      ordinal: 0,
      name: 'agent 1',
      status: 'pending',
    };
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-turn' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/turn',
          },
        ],
      },
      sessionPhaseRuns: { [SESSION_ID]: [defaultAgent] },
      selectedAgentId: { [SESSION_ID]: defaultAgent.id },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: {
        anthropic: { state: 'connected', identity: 'test' },
        cursor: { state: 'connected', identity: 'test' },
        codex: { state: 'connected', identity: 'test' },
      } as never,
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
  }

  it('enqueues an explicit user decision when audit insert fails', async () => {
    permissionAuditInsertSpy.mockRejectedValue(new Error('db locked'));

    async function* toolStream(): AsyncIterable<TurnEvent> {
      yield {
        kind: 'tool_call_start',
        toolUseId: 'tu-1',
        toolName: 'Edit',
        input: { path: '/tmp/x' },
        at: NOW,
      } as TurnEvent;
    }
    runTurnSpy.mockImplementation(() => toolStream());

    const useAppStore = await importStore();
    setupSession(useAppStore);
    useAppStore.setState({ volatilePermissionAllows: new Set(['tu-1']) });
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(permissionAuditInsertSpy).toHaveBeenCalledTimes(1);
    expect(auditRetryEnqueueSpy).toHaveBeenCalledTimes(1);
    const [enqueuedId, enqueuedPayload] = auditRetryEnqueueSpy.mock.calls[0] as [string, string];
    expect(typeof enqueuedId).toBe('string');
    const parsed = JSON.parse(enqueuedPayload) as Record<string, unknown>;
    expect(parsed.toolName).toBe('Edit');
    expect(typeof parsed.decision).toBe('string');
  });

  it('does not write or enqueue a default decision', async () => {
    permissionAuditInsertSpy.mockResolvedValue({});

    async function* toolStream(): AsyncIterable<TurnEvent> {
      yield {
        kind: 'tool_call_start',
        toolUseId: 'tu-2',
        toolName: 'Read',
        input: {},
        at: NOW,
      } as TurnEvent;
    }
    runTurnSpy.mockImplementation(() => toolStream());

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(permissionAuditInsertSpy).not.toHaveBeenCalled();
    expect(auditRetryEnqueueSpy).not.toHaveBeenCalled();
  });
});

describe('audit retry queue, drain worker (happy path)', () => {
  beforeEach(() => {
    runTurnSpy.mockImplementation(() => emptyStream());
    permissionRuleListSpy.mockResolvedValue([]);
    auditRetryEnqueueSpy.mockResolvedValue(undefined);
    auditRetryUpdateSpy.mockResolvedValue(undefined);
    auditRetryDeleteSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    auditRetryDrainSpy.mockReset();
    auditRetryDeleteSpy.mockReset();
    auditRetryUpdateSpy.mockReset();
    permissionAuditInsertSpy.mockReset();
  });

  async function runHydrate() {
    const { runDbMigrations } = await import('../shared/lib/db');
    (runDbMigrations as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { getSetting } = await import('@goodboy/db');
    (getSetting as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { getProviderStatus, getCursorStatus, getCodexStatus, checkProviderAuth } =
      await import('../features/providers/providers');
    (getProviderStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'connected',
      identity: 'test',
    });
    (getCursorStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'connected',
      identity: 'test',
    });
    (getCodexStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'connected',
      identity: 'test',
    });
    (checkProviderAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'connected',
      identity: 'test',
    });

    const mod = await import('./store');
    await mod.useAppStore.getState().hydrate();
    await Promise.resolve();
  }

  it('drain happy path: retries insert, deletes on success', async () => {
    const entry = { ...makeRetryEntry({ id: 'retry-happy', attempts: 2 }), updatedAt: 0 };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockResolvedValue({});

    await runHydrate();

    expect(auditRetryDrainSpy).toHaveBeenCalledWith(50);
    expect(permissionAuditInsertSpy).toHaveBeenCalledTimes(1);
    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-happy');
    expect(auditRetryUpdateSpy).not.toHaveBeenCalled();
  });

  it('drain failure path: increments attempts when insert still fails', async () => {
    const entry = { ...makeRetryEntry({ id: 'retry-fail', attempts: 3 }), updatedAt: 0 };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockRejectedValue(new Error('still locked'));

    await runHydrate();

    expect(auditRetryUpdateSpy).toHaveBeenCalledWith('retry-fail', 4, 'still locked');
    expect(auditRetryDeleteSpy).not.toHaveBeenCalled();
  });

  it('max-attempts boundary: deletes entry at attempt 5', async () => {
    const entry = { ...makeRetryEntry({ id: 'retry-max', attempts: 4 }), updatedAt: 0 };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockRejectedValue(new Error('permanent failure'));

    await runHydrate();

    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-max');
    expect(auditRetryUpdateSpy).not.toHaveBeenCalled();
  });

  it('max-attempts exhausted: emits an error notification', async () => {
    const entry = { ...makeRetryEntry({ id: 'retry-exhausted', attempts: 4 }), updatedAt: 0 };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockRejectedValue(new Error('permanent failure'));

    const mod = await import('./store');
    await runHydrate();

    await vi.waitFor(() => {
      expect(mod.useAppStore.getState().notifications).toEqual([
        expect.objectContaining({
          kind: 'error',
          severity: 'error',
          coalesceKey: 'audit-retry:exhausted',
        }),
      ]);
    });
    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-exhausted');
  });

  it('drain skips rows with invalid JSON payload (deletes them)', async () => {
    const entry = {
      ...makeRetryEntry({ id: 'retry-bad-json', payloadJson: 'not-json' }),
      updatedAt: 0,
    };
    auditRetryDrainSpy.mockResolvedValue([entry]);

    await runHydrate();

    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-bad-json');
    expect(permissionAuditInsertSpy).not.toHaveBeenCalled();
  });

  it('drain deletes legacy default decisions without inserting them', async () => {
    const entry = {
      ...makeRetryEntry({
        id: 'retry-default',
        payloadJson: JSON.stringify({
          id: 'req-default',
          runId: 'run-1',
          sessionId: SESSION_ID,
          toolUseId: 'tu-default',
          toolName: 'Read',
          inputJson: '{}',
          decision: 'deny',
          decidedBy: 'default',
          requestedAt: NOW,
          decidedAt: NOW,
        }),
      }),
      updatedAt: 0,
    };
    auditRetryDrainSpy.mockResolvedValue([entry]);

    await runHydrate();

    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-default');
    expect(permissionAuditInsertSpy).not.toHaveBeenCalled();
  });

  it('corrupt payload: emits a warning notification and deletes the entry', async () => {
    const entry = {
      ...makeRetryEntry({ id: 'retry-bad-json', payloadJson: 'not-json' }),
      updatedAt: 0,
    };
    auditRetryDrainSpy.mockResolvedValue([entry]);

    const mod = await import('./store');
    await runHydrate();

    await vi.waitFor(() => {
      expect(mod.useAppStore.getState().notifications).toEqual([
        expect.objectContaining({
          kind: 'error',
          severity: 'warning',
          coalesceKey: 'audit-retry:corrupt',
        }),
      ]);
    });
    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-bad-json');
  });

  it('backoff: skips entry whose updatedAt is too recent for attempt count', async () => {
    const entry = {
      ...makeRetryEntry({ id: 'retry-backoff', attempts: 0 }),
      updatedAt: Date.now(),
    };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockResolvedValue({});

    await runHydrate();

    expect(permissionAuditInsertSpy).not.toHaveBeenCalled();
    expect(auditRetryDeleteSpy).not.toHaveBeenCalled();
  });

  it('backoff: processes entry whose updatedAt is old enough', async () => {
    const entry = { ...makeRetryEntry({ id: 'retry-old', attempts: 0 }), updatedAt: 0 };
    auditRetryDrainSpy.mockResolvedValue([entry]);
    permissionAuditInsertSpy.mockResolvedValue({});

    await runHydrate();

    expect(permissionAuditInsertSpy).toHaveBeenCalledTimes(1);
    expect(auditRetryDeleteSpy).toHaveBeenCalledWith('retry-old');
  });
});
