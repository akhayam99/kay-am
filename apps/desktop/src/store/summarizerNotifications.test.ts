import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoDateTime, ProviderId, SessionId, WorkspaceId } from '@goodboy/types';

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
  listen: vi.fn(async () => () => undefined),
}));

vi.mock('../shared/lib/db', () => ({
  runDbMigrations: vi.fn(async () => undefined),
  wipeDb: vi.fn(async () => undefined),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

vi.mock('../features/providers/providers', () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(async () => ({ state: 'connected', identity: 'test' })),
  getCursorStatus: vi.fn(async () => null),
  getCodexStatus: vi.fn(async () => null),
  getProviderStatus: vi.fn(async () => null),
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
  invokeAgentSetKind: vi.fn(async () => undefined),
  invokeAgentSetVerbosity: vi.fn(async () => undefined),
  invokeAgentMarkViewed: vi.fn(async () => undefined),
  invokeAgentSetProviderSessionId: vi.fn(async () => undefined),
  invokeWorkspacesWithUnread: vi.fn(async () => []),
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

const summarizeSpy = vi.fn();

const summarizerRoutes: Array<{ providerId: string; model: string }> = [];

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return {
    ...actual,
    Summarizer: class {
      constructor(opts: { providerId: string; model: string }) {
        summarizerRoutes.push({ providerId: opts.providerId, model: opts.model });
      }
      summarize() {
        return summarizeSpy();
      }
    },
  };
});

const insertNotificationSpy = vi.fn(async (..._args: ReadonlyArray<unknown>) => undefined);

vi.mock('@goodboy/db', () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  insertMessage: vi.fn(async () => undefined),
  insertProviderRun: vi.fn(async () => undefined),
  insertSession: vi.fn(async () => undefined),
  insertSessionWorktree: vi.fn(async () => undefined),
  insertTelemetry: vi.fn(async () => undefined),
  insertWorkspace: vi.fn(async () => undefined),
  disconnectWorkspace: vi.fn(async () => undefined),
  reconnectWorkspace: vi.fn(async () => undefined),
  touchWorkspaceLastAccessed: vi.fn(async () => undefined),
  findWorkspaceByRootPath: vi.fn(async () => null),
  upsertSessionExternalTask: vi.fn(async () => undefined),
  deleteSessionExternalTask: vi.fn(async () => undefined),
  listExternalTasksForWorkspace: vi.fn(async () => []),
  listContextSlotsForSession: vi.fn(async () => []),
  insertContextSlotHistory: vi.fn(async () => undefined),
  listContextSlotHistory: vi.fn(async () => []),
  countContextSlotHistoryForSession: vi.fn(async () => ({})),
  listMessagesForAgent: vi.fn(async () => []),
  listMessagesForSession: vi.fn(async () => []),
  listTurnEventsForAgent: vi.fn(async () => []),
  listTurnEventsForSession: vi.fn(async () => []),
  listAgentRunIdsForSession: vi.fn(async () => new Map()),
  listSessionsForWorkspace: vi.fn(async () => []),
  listArchivedSessionsForWorkspace: vi.fn(async () => []),
  listTelemetryForSession: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => []),
  listWorktreesForSession: vi.fn(async () => []),
  listWorktreesForSessions: vi.fn(async () => new Map()),
  listAgentsForSessions: vi.fn(async () => new Map()),
  deleteWorktreesForSession: vi.fn(async () => undefined),
  updateSessionWorktreeBranch: vi.fn(async () => undefined),
  listAllSessionWorktrees: vi.fn(async () => []),
  renameSession: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
  archiveSession: vi.fn(async () => undefined),
  unarchiveSession: vi.fn(async () => undefined),
  updateSessionConfig: vi.fn(async () => undefined),
  updateAgentConfig: vi.fn(async () => undefined),
  summarizeSessionTelemetry: vi.fn(async () => null),
  summarizeWorkspaceTelemetry: vi.fn(async () => null),
  summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
  updateProviderRunStatus: vi.fn(async () => undefined),
  updateSessionPermissionMode: vi.fn(async () => undefined),
  updateSessionAutoRun: vi.fn(async () => undefined),
  updateSessionTitleUserEdited: vi.fn(async () => undefined),
  updateSessionState: vi.fn(async () => undefined),
  attachWorkflowToSession: vi.fn(async () => undefined),
  detachWorkflowFromSession: vi.fn(async () => undefined),
  updateWorkflowOrder: vi.fn(async () => undefined),
  updateSessionWorkflowStep: vi.fn(async () => undefined),
  listProjectScripts: vi.fn(async () => []),
  upsertProjectScript: vi.fn(async () => undefined),
  deleteProjectScript: vi.fn(async () => undefined),
  upsertContextSlot: vi.fn(async () => undefined),
  listOpenQuestionsForSession: vi.fn(async () => []),
  insertNudgeEvent: vi.fn(async () => undefined),
  updateNudgeEventOutcome: vi.fn(async () => undefined),
  insertNotification: insertNotificationSpy,
  listNotifications: vi.fn(async () => []),
  countNotifications: vi.fn(async () => ({ total: 0, unread: 0 })),
  NOTIFICATION_LIST_LIMIT: 200,
  markAllNotificationsRead: vi.fn(async () => undefined),
  clearAllNotifications: vi.fn(async () => undefined),
  listDiffCommentsForSession: vi.fn(async () => []),
  insertDiffComment: vi.fn(async () => undefined),
  resolveDiffComment: vi.fn(async () => undefined),
  reopenDiffComment: vi.fn(async () => undefined),
  consumeDiffComments: vi.fn(async () => undefined),
  deleteDiffComment: vi.fn(async () => undefined),
  listIntegrationBindingsForWorkspace: vi.fn(async () => []),
  getIntegrationBinding: vi.fn(async () => null),
  upsertIntegrationBinding: vi.fn(async () => undefined),
  deleteIntegrationBinding: vi.fn(async () => undefined),
  deleteIntegrationBindingsForProvider: vi.fn(async () => undefined),
  insertOpenQuestion: vi.fn(async () => undefined),
  markOpenQuestionsResolvedByText: vi.fn(async () => 0),
  listResolvedQuestionTextsForSession: vi.fn(async () => []),
  insertTurnEvent: vi.fn(async () => undefined),
  insertTurnEventsBatch: vi.fn(async () => undefined),
  getGithubPrCache: vi.fn(async () => null),
  upsertGithubPrCache: vi.fn(async () => undefined),
  deleteGithubPrCache: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

const SESSION_ID = 'session-notif-test' as SessionId;
const WORKSPACE_ID = 'ws-notif-test' as WorkspaceId;
const NOW = '2026-07-23T00:00:00.000Z' as IsoDateTime;

describe('summarizer notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertNotificationSpy.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('a successful summary notifies nobody', async () => {
    summarizeSpy.mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'claude-haiku-4-5',
    });

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues } = await import('./turn-helpers');

    summarizerQueues.delete(SESSION_ID);
    useAppStore.setState({
      sessions: [
        {
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
        },
      ],
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
      'user input',
      'agent output',
    );

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(insertNotificationSpy).not.toHaveBeenCalled();
  });

  it('failure notification body includes provider and error, carries retry action', async () => {
    summarizeSpy.mockRejectedValue(new Error('model overloaded'));

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues } = await import('./turn-helpers');

    summarizerQueues.delete(SESSION_ID);
    useAppStore.setState({
      sessions: [
        {
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
        },
      ],
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
      'user input',
      'agent output',
    );

    await vi.waitFor(() => expect(insertNotificationSpy).toHaveBeenCalled(), { timeout: 5000 });

    type NotifCall = [unknown, Record<string, unknown>];
    const calls = insertNotificationSpy.mock.calls as unknown as NotifCall[];
    const call = calls.find((c) => c[1].severity === 'error');
    expect(call).not.toBeUndefined();
    const n = call?.[1] ?? {};
    expect(n.body as string).toContain('anthropic');
    expect(n.body as string).toContain('model overloaded');
    expect(n.action).toEqual({ kind: 'retry-summarizer', sessionId: SESSION_ID });
  });

  it('retries a parse failure exactly once before surfacing it', async () => {
    const { SummarizerParseError } = await import('@goodboy/core');
    summarizeSpy.mockRejectedValue(new SummarizerParseError('not valid JSON', 'Sistema bloccato'));

    const { useAppStore } = await import('./store');
    const { enqueueSummarizer, summarizerQueues } = await import('./turn-helpers');

    summarizerQueues.delete(SESSION_ID);
    useAppStore.setState({
      sessions: [
        {
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
        },
      ],
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
      'user input',
      'agent output',
    );

    await vi.waitFor(() => expect(insertNotificationSpy).toHaveBeenCalled(), { timeout: 5000 });

    expect(summarizeSpy).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('error');
  });
});

type SeedParams = {
  readonly connected: ReadonlyArray<ProviderId>;
  readonly cooldowns?: Readonly<Partial<Record<ProviderId, number>>>;
};

const seedSummarizerState = async ({ connected, cooldowns }: SeedParams) => {
  const { useAppStore } = await import('./store');
  const { PROVIDER_CAPABILITIES } = await import('@goodboy/core');
  useAppStore.setState({
    sessions: [
      {
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
      },
    ],
    sessionSlots: {},
    summarizerStatus: {},
    providerCooldowns: cooldowns ?? {},
    providers: connected.map((id) => ({
      id,
      label: id,
      binary: id,
      docsUrl: '',
      capabilities: PROVIDER_CAPABILITIES[id],
      connection: 'connected' as const,
      version: null,
      identity: null,
      error: null,
    })),
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
        },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  });
  return useAppStore;
};

const enqueue = async () => {
  const { useAppStore } = await import('./store');
  const { enqueueSummarizer, summarizerQueues } = await import('./turn-helpers');
  summarizerQueues.delete(SESSION_ID);
  enqueueSummarizer(
    useAppStore.setState,
    useAppStore.getState,
    SESSION_ID,
    'user input',
    'agent output',
  );
};

const coalesceKeys = (): ReadonlyArray<string | null | undefined> =>
  insertNotificationSpy.mock.calls.map(
    (args) => (args[1] as { coalesceKey?: string | null } | undefined)?.coalesceKey,
  );

describe('summarizer provider fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertNotificationSpy.mockReset();
    summarizerRoutes.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('moves to another provider when the first one is out of tokens', async () => {
    summarizeSpy.mockRejectedValueOnce(new Error('Claude usage limit reached')).mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(summarizerRoutes.map((route) => route.providerId)).toEqual(['anthropic', 'codex']);
    expect(insertNotificationSpy).not.toHaveBeenCalled();
  });

  it('records a cooldown for the provider that ran out', async () => {
    summarizeSpy.mockRejectedValueOnce(new Error('Claude usage limit reached')).mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(useAppStore.getState().providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('moves to another provider on an authentication failure', async () => {
    summarizeSpy.mockRejectedValueOnce(new Error('401 unauthorized')).mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(summarizerRoutes.map((route) => route.providerId)).toEqual(['anthropic', 'codex']);
  });

  it('records a cooldown for a provider that is unauthenticated', async () => {
    summarizeSpy.mockRejectedValueOnce(new Error('401 unauthorized')).mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(useAppStore.getState().providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('records a cooldown for a provider that is rate limited', async () => {
    summarizeSpy.mockRejectedValueOnce(new Error('429 too many requests')).mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(useAppStore.getState().providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('stops at one provider switch and notifies once', async () => {
    summarizeSpy.mockRejectedValue(new Error('Claude usage limit reached'));

    const useAppStore = await seedSummarizerState({ connected: ['anthropic', 'codex', 'gemini'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('error'),
      { timeout: 5000 },
    );

    expect(summarizeSpy).toHaveBeenCalledTimes(2);
    expect(insertNotificationSpy).toHaveBeenCalledTimes(1);
  });

  it('skips a cooling-down provider on the next enqueue', async () => {
    summarizeSpy.mockResolvedValue({
      delta: { upserts: [] },
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0, estimatedCostUsd: 0 },
      model: 'gpt-5.4',
    });

    const useAppStore = await seedSummarizerState({
      connected: ['anthropic', 'codex'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('idle'),
      { timeout: 5000 },
    );

    expect(summarizerRoutes.map((route) => route.providerId)).toEqual(['codex']);
  });

  it('stops spawning and says so when no provider is left', async () => {
    summarizeSpy.mockRejectedValue(new Error('Claude usage limit reached'));

    const useAppStore = await seedSummarizerState({ connected: ['anthropic'] });
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('error'),
      { timeout: 5000 },
    );

    await enqueue();
    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.error).toContain('cooling'),
      { timeout: 5000 },
    );

    expect(summarizeSpy).toHaveBeenCalledTimes(1);
    expect(coalesceKeys()).toEqual([
      `summarizer-failed:${SESSION_ID}`,
      expect.stringContaining(`summarizer-cooling:${SESSION_ID}:`),
    ]);
  });

  it('does not write providerCooldowns for a non-cooldown failure kind', async () => {
    summarizeSpy.mockRejectedValue(new Error('the model produced nonsense'));

    const useAppStore = await seedSummarizerState({ connected: ['anthropic'] });
    const setStateSpy = vi.spyOn(useAppStore, 'setState');
    await enqueue();

    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.status).toBe('error'),
      { timeout: 5000 },
    );

    const cooldownWrites = setStateSpy.mock.calls.filter((call) => {
      const updater = call[0];
      const patch = typeof updater === 'function' ? updater(useAppStore.getState()) : updater;
      return patch != null && 'providerCooldowns' in patch;
    });
    expect(cooldownWrites).toHaveLength(0);
    expect(useAppStore.getState().providerCooldowns).toEqual({});
  });

  it('reuses one coalesce key while the same cooldown window holds', async () => {
    summarizeSpy.mockRejectedValue(new Error('Claude usage limit reached'));

    const useAppStore = await seedSummarizerState({
      connected: ['anthropic'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });
    await enqueue();
    await vi.waitFor(
      () => expect(useAppStore.getState().summarizerStatus[SESSION_ID]?.error).toContain('cooling'),
      { timeout: 5000 },
    );
    await enqueue();
    await vi.waitFor(() => expect(insertNotificationSpy).toHaveBeenCalledTimes(2), {
      timeout: 5000,
    });

    expect(summarizeSpy).not.toHaveBeenCalled();
    const keys = coalesceKeys();
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain(`summarizer-cooling:${SESSION_ID}:`);
  });
});
