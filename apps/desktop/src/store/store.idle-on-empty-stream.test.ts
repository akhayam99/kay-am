import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProjectId,
  Agent,
  AgentId,
  IsoDateTime,
  ProviderRunId,
  Session,
  SessionId,
  TurnEvent,
  WorkspaceId,
} from '@goodboy/types';
import { decodeAuthRequiredMessage } from '../features/chat/turn';

const { runTurnSpy, cancelTurnSpy } = vi.hoisted(() => ({
  runTurnSpy: vi.fn(),
  cancelTurnSpy: vi.fn(),
}));

vi.mock('../features/chat/turn', async () => {
  const actual =
    await vi.importActual<typeof import('../features/chat/turn')>('../features/chat/turn');
  return {
    ...actual,
    runTurn: (args: unknown) => runTurnSpy(args),
    cancelTurn: cancelTurnSpy,
  };
});

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionAuditInsert: vi.fn(),
  invokeAuditRetryEnqueue: vi.fn(async () => undefined),
  invokeAuditRetryDrain: vi.fn(async () => []),
  invokeAuditRetryUpdate: vi.fn(async () => undefined),
  invokeAuditRetryDelete: vi.fn(async () => undefined),
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
  updateAgentConfig: vi.fn(),
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

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;

function buildSession(): Session {
  const now = '2026-05-08T00:00:00.000Z' as IsoDateTime;
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    goal: 'test',
    state: { kind: 'idle', lastActivityAt: now },
    contextSlots: [],
    providerPreference: {
      defaultProvider: 'anthropic',
      allowTurnOverride: false,
    },
    permissionMode: 'bypassPermissions' as const,
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function* emptyStream(): AsyncIterable<TurnEvent> {}

async function* doneOnlyStream(runId: ProviderRunId): AsyncIterable<TurnEvent> {
  yield {
    kind: 'done',
    runId,
    at: '2026-05-08T00:00:01.000Z' as IsoDateTime,
  };
}

async function* throwingStream(runId: ProviderRunId): AsyncIterable<TurnEvent> {
  yield {
    kind: 'assistant_text',
    runId,
    delta: 'partial',
    at: '2026-05-08T00:00:01.000Z' as IsoDateTime,
  };
  throw new Error('provider crashed mid-stream');
}

const OAUTH_EXPIRED_MESSAGE =
  'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth access token has expired. Re-authenticate to continue."},"request_id":null}';

const MAX_MODE_MESSAGE =
  'ActionRequiredError: Max Mode Required  The model "gpt-5.5-high" requires Max Mode to be enabled.';

async function* authErrorEventStream(runId: ProviderRunId): AsyncIterable<TurnEvent> {
  yield {
    kind: 'error',
    runId,
    message: OAUTH_EXPIRED_MESSAGE,
    at: '2026-05-08T00:00:01.000Z' as IsoDateTime,
  };
}

async function* throwingAuthErrorStream(runId: ProviderRunId): AsyncIterable<TurnEvent> {
  yield {
    kind: 'assistant_text',
    runId,
    delta: 'partial',
    at: '2026-05-08T00:00:01.000Z' as IsoDateTime,
  };
  throw new Error(OAUTH_EXPIRED_MESSAGE);
}

type ErrorStreamParams = {
  readonly message: string;
};

const throwingErrorStream = async function* ({
  message,
}: ErrorStreamParams): AsyncIterable<TurnEvent> {
  throw new Error(message);
};

async function* nonAuthErrorEventStream(runId: ProviderRunId): AsyncIterable<TurnEvent> {
  yield {
    kind: 'error',
    runId,
    message: 'connection reset by peer',
    at: '2026-05-08T00:00:01.000Z' as IsoDateTime,
  };
}

describe('sendTurn, terminal state guarantees', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    cancelTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-3-5-sonnet-latest',
      reason: 'preference',
    });
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
      transcripts: {},
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
          createdAt: '2026-05-08T00:00:00.000Z' as IsoDateTime,
          updatedAt: '2026-05-08T00:00:00.000Z' as IsoDateTime,
        },
      ],
    });
  }

  it('transitions session to idle after stream ends without a done event', async () => {
    runTurnSpy.mockImplementation(() => emptyStream());

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hello' });

    const session = useAppStore.getState().sessions.find((s) => s.id === SESSION_ID);
    expect(session?.state.kind).toBe('idle');
  });

  it('emits a scoped warning near the context limit and still runs the turn', async () => {
    runTurnSpy.mockImplementation(() => emptyStream());
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-haiku-4-5',
      reason: 'preference',
    });

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      content: 'x'.repeat(680_000),
    });

    expect(runTurnSpy).toHaveBeenCalledOnce();
    await vi.waitFor(() => {
      expect(useAppStore.getState().notifications).toEqual([
        expect.objectContaining({
          kind: 'error',
          severity: 'warning',
          sessionId: SESSION_ID,
          workspaceId: WORKSPACE_ID,
          coalesceKey: `context-soft-cap:${SESSION_ID}`,
        }),
      ]);
    });
  });

  it('appends an error event when the stream ends with no assistant text', async () => {
    runTurnSpy.mockImplementation(() => emptyStream());

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hello' });

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvent = transcript.find((e) => e.kind === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent && 'message' in errorEvent ? errorEvent.message : '').toMatch(
      /provider exited without a response/i,
    );
    expect(errorEvent && 'retryable' in errorEvent ? errorEvent.retryable : undefined).not.toBe(
      true,
    );
  });

  it('appends user_text event so the user message is visible immediately', async () => {
    runTurnSpy.mockImplementation(() => emptyStream());

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'ciao mondo' });

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const userEvent = transcript.find((e) => e.kind === 'user_text');
    expect(userEvent).toBeDefined();
    expect(userEvent && 'text' in userEvent ? userEvent.text : '').toBe('ciao mondo');
  });

  it('does not append a duplicate error event when the stream emits a done event', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) => doneOnlyStream(args.runId));

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hi' });

    const session = useAppStore.getState().sessions.find((s) => s.id === SESSION_ID);
    expect(session?.state.kind).toBe('idle');

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvents = transcript.filter((e) => e.kind === 'error');
    expect(errorEvents).toHaveLength(0);
  });

  it('transitions session to error and rethrows when the stream throws mid-turn', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) => throwingStream(args.runId));

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'boom' }),
    ).rejects.toThrow('provider crashed mid-stream');

    const session = useAppStore.getState().sessions.find((s) => s.id === SESSION_ID);
    expect(session?.state.kind).toBe('error');

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvents = transcript.filter((e) => e.kind === 'error');
    expect(errorEvents).toHaveLength(1);
    const errorEvent = errorEvents[0];
    expect(errorEvent && 'message' in errorEvent ? errorEvent.message : '').toMatch(
      /provider crashed mid-stream/i,
    );
    expect(errorEvent && 'retryable' in errorEvent ? errorEvent.retryable : undefined).toBe(true);
  });

  it('marks the provider run failed when the stream throws mid-turn', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) => throwingStream(args.runId));

    const { updateProviderRunStatus } = await import('@goodboy/db');
    (updateProviderRunStatus as ReturnType<typeof vi.fn>).mockClear();

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'boom' }),
    ).rejects.toThrow();

    const statuses = (updateProviderRunStatus as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[2] as { kind: string }).kind,
    );
    expect(statuses).toContain('failed');
  });

  it('encodes a stream error event carrying the OAuth 401 text as auth_required, not a raw error item', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) =>
      authErrorEventStream(args.runId),
    );

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hello' });

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvent = transcript.find((e) => e.kind === 'error');
    const message = errorEvent && 'message' in errorEvent ? errorEvent.message : '';
    expect(message).toMatch(/^__auth_required__:/);
    expect(decodeAuthRequiredMessage(message)).toEqual({
      providerId: 'anthropic',
      identity: 'test',
    });
  });

  it('encodes a thrown OAuth 401 error the same way as a stream error event', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) =>
      throwingAuthErrorStream(args.runId),
    );

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'boom' }),
    ).rejects.toThrow();

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvent = transcript.find((e) => e.kind === 'error');
    const message = errorEvent && 'message' in errorEvent ? errorEvent.message : '';
    expect(decodeAuthRequiredMessage(message)).toEqual({
      providerId: 'anthropic',
      identity: 'test',
    });
  });

  it('surfaces the model and Max Mode action when the child exits with Max Mode stderr', async () => {
    runTurnSpy.mockImplementation(() => throwingErrorStream({ message: MAX_MODE_MESSAGE }));

    const useAppStore = await importStore();
    setupSession(useAppStore);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      selectedProvider: 'cursor',
      selectedModel: 'gpt-5.5-high',
      reason: 'preference',
    });

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'boom' }),
    ).rejects.toThrow(MAX_MODE_MESSAGE);

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvent = transcript.find((event) => event.kind === 'error');
    const message = errorEvent && 'message' in errorEvent ? errorEvent.message : '';
    expect(message).toContain('gpt-5.5-high');
    expect(message).toContain('usage-based pricing');
    expect(message).not.toContain('CLI is configured correctly');
    expect(runTurnSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ model: 'gpt-5.5-high', cursorMaxMode: true }),
    );
    const turnState = useAppStore.getState().agentTurnState[AGENT_ID];
    expect(turnState?.kind).toBe('error');
  });

  it('leaves a non-auth provider error event message verbatim', async () => {
    runTurnSpy.mockImplementation((args: { runId: ProviderRunId }) =>
      nonAuthErrorEventStream(args.runId),
    );

    const useAppStore = await importStore();
    setupSession(useAppStore);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hello' });

    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const errorEvent = transcript.find((e) => e.kind === 'error');
    expect(errorEvent && 'message' in errorEvent ? errorEvent.message : '').toBe(
      'connection reset by peer',
    );
  });
});
