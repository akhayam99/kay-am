import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ProjectId,
  Agent,
  AgentId,
  IsoDateTime,
  PermissionRule,
  PermissionRuleId,
  ProviderRunId,
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

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: (args: unknown) => permissionRuleListSpy(args),
  invokePermissionAuditInsert: (args: unknown) => permissionAuditInsertSpy(args),
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
  buildProviderList: () => [
    { id: 'anthropic', binary: 'claude', connection: 'connected' },
    { id: 'cursor', binary: 'cursor-agent', connection: 'connected' },
  ],
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
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const AGENT_ID = 'agent-1' as AgentId;

function buildSession(): Session {
  const now = '2026-05-07T00:00:00.000Z' as IsoDateTime;
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
    permissionMode: 'bypassPermissions',
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: now,
    updatedAt: now,
  };
}

function buildRule(overrides: Partial<PermissionRule>): PermissionRule {
  const now = '2026-05-07T00:00:00.000Z' as IsoDateTime;
  return {
    id: 'rule-1' as PermissionRuleId,
    scope: 'session',
    sessionId: SESSION_ID,
    pattern: { tool: 'Edit' },
    decision: 'allow',
    priority: 100,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function* emptyStream(): AsyncIterable<TurnEvent> {}

describe('sendTurn, permission proxy integration', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    cancelTurnSpy.mockReset();
    permissionRuleListSpy.mockReset();
    permissionAuditInsertSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    permissionRuleListSpy.mockResolvedValue([]);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockReset();
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
      id: AGENT_ID,
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
          createdAt: '2026-05-07T00:00:00.000Z' as IsoDateTime,
          updatedAt: '2026-05-07T00:00:00.000Z' as IsoDateTime,
        },
      ],
    });
  }

  it('forwards disallowedTools when a deny rule is configured (claude)', async () => {
    permissionRuleListSpy.mockImplementation(async (args: { scope: string }) => {
      if (args.scope === 'session') {
        return [
          buildRule({
            decision: 'deny',
            pattern: { tool: 'Bash', argsMatcher: 'rm:*' },
          }),
        ];
      }
      return [];
    });

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hello' });

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.disallowedTools).toEqual(['Bash(rm:*)']);
    expect(args.allowedTools).toEqual([]);
    expect(args.permissionMode).toBe('bypassPermissions');
  });

  it('forwards allowedTools when an allow rule is configured (claude)', async () => {
    permissionRuleListSpy.mockImplementation(async (args: { scope: string }) => {
      if (args.scope === 'session') {
        return [buildRule({ decision: 'allow', pattern: { tool: 'Edit' } })];
      }
      return [];
    });

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hi' });

    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.allowedTools).toEqual(['Edit']);
    expect(args.disallowedTools).toEqual([]);
  });

  it('forwards empty tool lists with default mode when no rules exist (claude)', async () => {
    permissionRuleListSpy.mockResolvedValue([]);

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hi' });

    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.allowedTools).toEqual([]);
    expect(args.disallowedTools).toEqual([]);
    expect(args.permissionMode).toBe('bypassPermissions');
    expect(JSON.stringify(args)).not.toContain('dangerously-skip-permissions');
  });

  it('keeps scout restrictions in copy instead of enforcing read-only tools', async () => {
    const useAppStore = await importStore();
    setupSession(useAppStore);
    useAppStore.setState({ agentKindOverride: { [AGENT_ID]: 'scout' } });
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'inspect' });

    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.systemPrompt).toContain('FORBIDDEN: editing files');
    expect(args.allowedTools).toEqual([]);
    expect(args.disallowedTools).toEqual([]);
    expect(args.permissionMode).toBe('bypassPermissions');
  });

  it('does NOT forward permission flags when provider is cursor', async () => {
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      selectedProvider: 'cursor',
      selectedModel: 'cursor-default',
      reason: 'preference',
    });

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hi' });

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.allowedTools).toBeUndefined();
    expect(args.disallowedTools).toBeUndefined();
    expect(args.permissionMode).toBeUndefined();
    expect(permissionRuleListSpy).not.toHaveBeenCalled();
  });

  it('marks the agent turn blocked when the stream reports a permission request', async () => {
    const runId = 'run-blocked' as ProviderRunId;
    runTurnSpy.mockImplementation(async function* (): AsyncIterable<TurnEvent> {
      yield {
        kind: 'permission_request',
        runId,
        toolUseId: 'toolu_1',
        toolName: 'Write',
        input: { file_path: '/tmp/wt/out.txt' },
        at: '2026-05-07T00:00:00.000Z' as IsoDateTime,
      };
    });

    const useAppStore = await importStore();
    setupSession(useAppStore);
    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'hi' });

    expect(useAppStore.getState().agentTurnState[AGENT_ID]?.kind).toBe('blocked');
  });

  it('retryBlockedTool re-sends the turn with a prompt naming the approved tool', async () => {
    const useAppStore = await importStore();
    setupSession(useAppStore);
    useAppStore.setState({
      agentTurnState: {
        [AGENT_ID]: {
          kind: 'blocked',
          runId: 'run-blocked' as ProviderRunId,
          blockedAt: '2026-05-07T00:00:00.000Z' as IsoDateTime,
        },
      },
    });

    await useAppStore
      .getState()
      .retryBlockedTool({ sessionId: SESSION_ID, agentId: AGENT_ID, toolName: 'Bash' });

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const args = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(String(args.prompt)).toContain('Permission for Bash is now granted.');
  });

  it('retryBlockedTool does nothing while that agent is still running', async () => {
    const useAppStore = await importStore();
    setupSession(useAppStore);
    useAppStore.setState({
      agentTurnState: {
        [AGENT_ID]: {
          kind: 'running',
          runId: 'run-live' as ProviderRunId,
          startedAt: '2026-05-07T00:00:00.000Z' as IsoDateTime,
        },
      },
    });

    await useAppStore
      .getState()
      .retryBlockedTool({ sessionId: SESSION_ID, agentId: AGENT_ID, toolName: 'Bash' });

    expect(runTurnSpy).not.toHaveBeenCalled();
  });
});
