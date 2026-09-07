// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTING_EDITOR_BINARY } from '../../../features/settings/settings';
import { SETTING_CHANGELOG_SEEN } from '../changelog/state';
import type {
  Agent,
  AgentId,
  BudgetRule,
  BudgetAlert,
  ContextSlot,
  DiffComment,
  GhTokenStatus,
  IsoDateTime,
  PlanConsumption,
  PlanConsumptionId,
  PlanId,
  PlanWithCount,
  Project,
  ProjectId,
  ProviderRunId,
  Session,
  SessionId,
  Skill,
  SkillId,
  TelemetryRecord,
  TelemetryRecordId,
  TurnEvent,
  Workflow,
  WorkflowId,
  Workspace,
  WorkspaceId,
  IntegrationBinding,
  IntegrationBindingId,
  ProjectScript,
  ProjectScriptId,
} from '@goodboy/types';

const { invokeSpy } = vi.hoisted(() => ({
  invokeSpy: vi.fn(async (_command?: unknown) => null as unknown),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeSpy,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}));

const listWorkspacesSpy = vi.fn(async () => [] as ReadonlyArray<Workspace>);
const listProjectsForWorkspaceSpy = vi.fn(async () => [] as ReadonlyArray<Project>);
const listProviderCredentialsSpy = vi.fn(async () => []);
const runDbMigrationsSpy = vi.fn(async () => undefined);
const dbSetSettingSpy = vi.fn(async () => undefined);
const dbGetSettingSpy: ReturnType<typeof vi.fn> = vi.fn<() => Promise<string | null>>(
  async () => null,
);
const insertNotificationSpy = vi.fn(async () => undefined);
const listNotificationsSpy = vi.fn(async () => []);
const insertNudgeEventSpy = vi.fn(async () => undefined);
const updateNudgeOutcomeSpy = vi.fn(async () => undefined);
const insertDiffCommentSpy = vi.fn(async () => undefined);
const listDiffCommentsSpy = vi.fn(async () => [] as ReadonlyArray<DiffComment>);
const resolveDiffCommentDbSpy = vi.fn(async () => undefined);
const reopenDiffCommentDbSpy = vi.fn(async () => undefined);
const consumeDiffCommentsDbSpy = vi.fn(async () => undefined);
const deleteDiffCommentDbSpy = vi.fn(async () => undefined);
const upsertIntegrationBindingSpy = vi.fn(async () => undefined);
const listIntegrationBindingsForWorkspaceSpy = vi.fn(
  async () => [] as ReadonlyArray<IntegrationBinding>,
);
const deleteIntegrationBindingSpy = vi.fn(async () => undefined);
const listProjectScriptsSpy = vi.fn(async () => [] as ReadonlyArray<ProjectScript>);
const upsertProjectScriptSpy = vi.fn(async () => undefined);
const deleteProjectScriptSpy = vi.fn(async () => undefined);

vi.mock('@goodboy/db', () => ({
  getSetting: dbGetSettingSpy,
  setSetting: dbSetSettingSpy,
  insertMessage: vi.fn(async () => undefined),
  insertProviderRun: vi.fn(async () => undefined),
  insertSession: vi.fn(async () => undefined),
  insertSessionWorktree: vi.fn(async () => undefined),
  insertTelemetry: vi.fn(async () => undefined),
  insertTurnEventsBatch: vi.fn(async () => undefined),
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
  listWorkspaces: listWorkspacesSpy,
  listProjectsForWorkspace: listProjectsForWorkspaceSpy,
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
  listProjectScripts: listProjectScriptsSpy,
  upsertProjectScript: upsertProjectScriptSpy,
  deleteProjectScript: deleteProjectScriptSpy,
  upsertContextSlot: vi.fn(async () => undefined),
  listOpenQuestionsForSession: vi.fn(async () => []),
  insertNudgeEvent: insertNudgeEventSpy,
  updateNudgeEventOutcome: updateNudgeOutcomeSpy,
  insertNotification: insertNotificationSpy,
  listNotifications: listNotificationsSpy,
  countNotifications: vi.fn(async () => ({ total: 0, unread: 0 })),
  NOTIFICATION_LIST_LIMIT: 200,
  markAllNotificationsRead: vi.fn(async () => undefined),
  markNotificationRead: vi.fn(async () => undefined),
  deleteNotification: vi.fn(async () => undefined),
  clearAllNotifications: vi.fn(async () => undefined),
  listDiffCommentsForSession: listDiffCommentsSpy,
  insertDiffComment: insertDiffCommentSpy,
  resolveDiffComment: resolveDiffCommentDbSpy,
  reopenDiffComment: reopenDiffCommentDbSpy,
  consumeDiffComments: consumeDiffCommentsDbSpy,
  deleteDiffComment: deleteDiffCommentDbSpy,
  listIntegrationBindingsForWorkspace: listIntegrationBindingsForWorkspaceSpy,
  getIntegrationBinding: vi.fn(async () => null),
  upsertIntegrationBinding: upsertIntegrationBindingSpy,
  deleteIntegrationBinding: deleteIntegrationBindingSpy,
  deleteIntegrationBindingsForProvider: vi.fn(async () => undefined),
  insertOpenQuestion: vi.fn(async () => undefined),
  markOpenQuestionsResolvedByText: vi.fn(async () => 0),
  listResolvedQuestionTextsForSession: vi.fn(async () => []),
  insertTurnEvent: vi.fn(async () => undefined),
  getGithubPrCache: vi.fn(async () => null),
  upsertGithubPrCache: vi.fn(async () => undefined),
  deleteGithubPrCache: vi.fn(async () => undefined),
  listProviderCredentials: listProviderCredentialsSpy,
}));

vi.mock('../../../shared/lib/db', () => ({
  runDbMigrations: runDbMigrationsSpy,
  wipeDb: vi.fn(async () => undefined),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

vi.mock('../../../shared/lib/ls-to-db-migration', () => ({
  migrateLsToDb: vi.fn(async () => undefined),
}));

vi.mock('../../../features/onboarding/onboarding-store', () => ({
  hydrateOnboardingFromDb: vi.fn(async () => undefined),
}));

vi.mock('../../../features/chat/turn', () => ({
  runTurn: vi.fn(),
  cancelTurn: vi.fn(async () => undefined),
  writeAttachment: vi.fn(async () => 'rel/path'),
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
}));

vi.mock('../../../features/permissions/permissions', () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionRuleUpsert: vi.fn(async () => undefined),
  invokePermissionAuditInsert: vi.fn(async () => undefined),
  invokeAuditRetryEnqueue: vi.fn(async () => undefined),
  invokeAuditRetryDrain: vi.fn(async () => []),
  invokeAuditRetryUpdate: vi.fn(async () => undefined),
  invokeAuditRetryDelete: vi.fn(async () => undefined),
}));

vi.mock('../../../features/providers/providers', () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(async () => ({ state: 'connected', identity: 'test' })),
  getCursorStatus: vi.fn(async () => null),
  getCodexStatus: vi.fn(async () => null),
  getGeminiStatus: vi.fn(async () => null),
  getOpenCodeStatus: vi.fn(async () => null),
  getOpenRouterStatus: vi.fn(async () => null),
  getMoonshotStatus: vi.fn(async () => null),
  getProviderStatus: vi.fn(async () => null),
}));

vi.mock('../../../features/providers/routing', () => ({
  resolveProviderForTurn: vi.fn(async () => ({
    selectedProvider: 'anthropic',
    selectedModel: 'claude-3-5-sonnet-latest',
    reason: 'preference',
  })),
}));

const invokeBudgetRuleListSpy = vi.fn(async () => [] as ReadonlyArray<BudgetRule>);
const invokeBudgetRuleUpsertSpy: ReturnType<typeof vi.fn> = vi.fn(async () => undefined);
const invokeBudgetRuleDeleteSpy = vi.fn(async () => undefined);
const invokeBudgetAlertsListSpy = vi.fn(async () => [] as ReadonlyArray<BudgetAlert>);
const invokeBudgetAlertDismissSpy = vi.fn(async () => undefined);
const invokeSessionBudgetGetSpy: ReturnType<typeof vi.fn> = vi.fn(async () => null);
const invokeSessionBudgetSetSpy = vi.fn(async () => undefined);

vi.mock('../../../features/budget/budget', () => ({
  invokeBudgetRuleList: invokeBudgetRuleListSpy,
  invokeBudgetRuleUpsert: invokeBudgetRuleUpsertSpy,
  invokeBudgetRuleDelete: invokeBudgetRuleDeleteSpy,
  invokeBudgetAlertsList: invokeBudgetAlertsListSpy,
  invokeBudgetAlertDismiss: invokeBudgetAlertDismissSpy,
  invokeSessionBudgetGet: invokeSessionBudgetGetSpy,
  invokeSessionBudgetSet: invokeSessionBudgetSetSpy,
  invokeCheckProviderBudget: vi.fn(async () => undefined),
}));

const invokeSkillListSpy = vi.fn(async () => [] as ReadonlyArray<Skill>);
const invokeSkillUpsertSpy = vi.fn(async () => undefined);
const invokeSkillDeleteSpy = vi.fn(async () => undefined);
const invokeSkillRescanSpy = vi.fn(async () => [] as ReadonlyArray<Skill>);

vi.mock('../../../features/skills/skills', () => ({
  invokeSkillList: invokeSkillListSpy,
  invokeSkillUpsert: invokeSkillUpsertSpy,
  invokeSkillDelete: invokeSkillDeleteSpy,
  invokeSkillRescan: invokeSkillRescanSpy,
  resolveSkillInvocation: vi.fn(),
}));

const invokeWorkflowListSpy = vi.fn(async () => [] as ReadonlyArray<Workflow>);
const invokeWorkflowUpsertSpy = vi.fn(async () => undefined);
const invokeWorkflowDeleteSpy = vi.fn(async () => undefined);
const invokeAgentListSpy = vi.fn(async () => [] as ReadonlyArray<Agent>);
const invokeAgentInsertSpy = vi.fn();
const invokeAgentUpdateStatusSpy = vi.fn();
const invokeAgentSetKindSpy = vi.fn(async () => undefined);
const invokeAgentSetVerbositySpy = vi.fn(async () => undefined);
const invokeAgentMarkViewedSpy = vi.fn(async () => undefined);
const invokeAgentSetProviderSessionIdSpy = vi.fn(async () => undefined);
const invokeWorkspacesWithUnreadSpy = vi.fn(async () => [] as ReadonlyArray<WorkspaceId>);

vi.mock('../../../features/workflows/workflows', () => ({
  invokeWorkflowList: invokeWorkflowListSpy,
  invokeWorkflowUpsert: invokeWorkflowUpsertSpy,
  invokeWorkflowDelete: invokeWorkflowDeleteSpy,
  invokeAgentList: invokeAgentListSpy,
  invokeAgentInsert: invokeAgentInsertSpy,
  invokeAgentUpdateStatus: invokeAgentUpdateStatusSpy,
  invokeAgentSetKind: invokeAgentSetKindSpy,
  invokeAgentSetVerbosity: invokeAgentSetVerbositySpy,
  invokeAgentMarkViewed: invokeAgentMarkViewedSpy,
  invokeAgentSetProviderSessionId: invokeAgentSetProviderSessionIdSpy,
  invokeWorkspacesWithUnread: invokeWorkspacesWithUnreadSpy,
}));

const createWorktreeSpy = vi.fn();
const removeWorktreeSpy = vi.fn(async () => undefined);
const changeWorktreeBranchSpy = vi.fn(async () => undefined);
const scanOrphanWorktreesSpy = vi.fn(
  async () => [] as ReadonlyArray<{ path: string; name: string; sizeBytes: number }>,
);
const removeOrphanWorktreeSpy = vi.fn(async () => undefined);

vi.mock('../../../features/worktree/worktree', () => ({
  createWorktree: createWorktreeSpy,
  removeWorktree: removeWorktreeSpy,
  changeWorktreeBranch: changeWorktreeBranchSpy,
  worktreeChangedFiles: vi.fn(async () => []),
  scanOrphanWorktrees: scanOrphanWorktreesSpy,
  removeOrphanWorktree: removeOrphanWorktreeSpy,
}));

vi.mock('../../../shared/lib/repo', () => ({
  validateGitRepo: vi.fn(async () => ({ isRepo: true, rootPath: '/tmp/repo' })),
}));

vi.mock('../../../shared/lib/editor', () => ({
  detectEditors: vi.fn(async () => []),
}));

const invokePlanListSpy = vi.fn(async () => [] as ReadonlyArray<PlanWithCount>);
const invokeUpsertPlanSpy = vi.fn();
const invokeSetPlanStatusSpy = vi.fn(async () => undefined);
const invokeSetPlanBodySpy = vi.fn(async () => undefined);
const invokeAddPlanConsumptionSpy = vi.fn(async () => undefined);
const invokeListConsumptionsForPlanSpy = vi.fn(async () => [] as ReadonlyArray<PlanConsumption>);

vi.mock('../../../features/plans/plans', () => ({
  listPlansForSession: invokePlanListSpy,
  upsertPlan: invokeUpsertPlanSpy,
  setPlanStatus: invokeSetPlanStatusSpy,
  setPlanBody: invokeSetPlanBodySpy,
  addPlanConsumption: invokeAddPlanConsumptionSpy,
  listConsumptionsForPlan: invokeListConsumptionsForPlanSpy,
}));

const linearConnectSpy = vi.fn();
const linearDisconnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/linear/client', () => ({
  linearConnect: linearConnectSpy,
  linearDisconnect: linearDisconnectSpy,
}));

const ghStatusSpy: ReturnType<typeof vi.fn> = vi.fn<() => Promise<GhTokenStatus>>(async () => ({
  available: true,
  mode: 'gh-cli',
  scopes: [],
}));
const ghSetTokenSpy = vi.fn();
const ghClearTokenSpy = vi.fn(async () => undefined);

vi.mock('../../../features/github/github', () => ({
  ghStatus: ghStatusSpy,
  ghSetToken: ghSetTokenSpy,
  ghClearToken: ghClearTokenSpy,
  tauriGhRunner: { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })) },
  createTauriPrCacheStore: () => ({ get: vi.fn(), upsert: vi.fn(), delete: vi.fn() }),
}));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    detectRepoSlug: vi.fn(async () => null),
    getPrForBranch: vi.fn(async () => null),
    fetchPrDetail: vi.fn(async () => null),
    fetchLinkedIssues: vi.fn(async () => []),
    resolveReviewThread: vi.fn(async () => undefined),
    addReviewThreadReply: vi.fn(async () => undefined),
    seedWorkflowLibrary: vi.fn(async () => undefined),
  };
});

vi.mock('../../../features/scripts/scripts', () => ({
  invokeScriptRun: vi.fn(async () => undefined),
  invokeScriptListLive: vi.fn(async () => {
    await invokeSpy('workspace_script_list_live');
    return [];
  }),
  invokeScriptCancel: vi.fn(async () => undefined),
  listenScriptOutput: vi.fn(async () => () => undefined),
  listenScriptExit: vi.fn(async () => () => undefined),
}));

vi.mock('../../../features/terminal/terminal', () => ({
  invokeTerminalOpen: vi.fn(async () => undefined),
  invokeTerminalListLive: vi.fn(async () => {
    await invokeSpy('terminal_list_live');
    return [];
  }),
  invokeTerminalClose: vi.fn(async () => undefined),
}));

vi.mock('../../../features/context/components/QuestionsTab/useOpenQuestions', () => ({
  useOpenQuestions: {
    getState: () => ({ loadQuestions: vi.fn(async () => undefined) }),
  },
}));

vi.mock('../../../features/settings/config-export', () => ({
  exportConfigToFile: vi.fn(async () => '/tmp/export.json'),
  importConfigFromFile: vi.fn(async () => null),
}));

const WS_ID = 'workspace-1' as WorkspaceId;
const WS_ID_2 = 'workspace-2' as WorkspaceId;
const SESSION_ID = 'session-1' as SessionId;
const SESSION_ID_2 = 'session-2' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const AGENT_ID_2 = 'agent-2' as AgentId;
const RUN_ID = 'run-1' as ProviderRunId;
const PLAN_ID = 'plan-1' as PlanId;
const NOW = '2026-05-28T00:00:00.000Z' as IsoDateTime;

function buildWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: WS_ID,
    name: 'ws',
    slug: 'ws',
    sessionsRoot: '/tmp/repo',
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
    lastAccessedAt: NOW,
    ...overrides,
  };
}

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    workspaceId: WS_ID,
    goal: 'do a thing',
    state: { kind: 'idle', lastActivityAt: NOW },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
    permissionMode: 'bypassPermissions',
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildAgent(overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent {
  return {
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'agent 1',
    status: 'pending',
    ...overrides,
  };
}

function buildPlan(overrides: Partial<PlanWithCount> = {}): PlanWithCount {
  return {
    id: PLAN_ID,
    sessionId: SESSION_ID,
    agentId: AGENT_ID,
    title: 't',
    bodyMd: 'b',
    status: 'active',
    consumptionCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function getStore() {
  const mod = await import('../../store');
  return mod.useAppStore;
}

let resetState: Record<string, unknown> | null = null;

describe('store contract', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    invokeSpy.mockImplementation(async () => null);
    invokeBudgetRuleListSpy.mockResolvedValue([]);
    invokeBudgetAlertsListSpy.mockResolvedValue([]);
    invokeSessionBudgetGetSpy.mockResolvedValue(null);
    invokeWorkflowListSpy.mockResolvedValue([]);
    invokeAgentListSpy.mockResolvedValue([]);
    invokeSkillListSpy.mockResolvedValue([]);
    invokeSkillRescanSpy.mockResolvedValue([]);
    invokePlanListSpy.mockResolvedValue([]);
    invokeListConsumptionsForPlanSpy.mockResolvedValue([]);
    invokeWorkspacesWithUnreadSpy.mockResolvedValue([]);
    listProjectScriptsSpy.mockResolvedValue([]);
    listIntegrationBindingsForWorkspaceSpy.mockResolvedValue([]);
    listDiffCommentsSpy.mockResolvedValue([]);
    dbGetSettingSpy.mockResolvedValue(null);
    ghStatusSpy.mockResolvedValue({ available: true, mode: 'gh-cli', scopes: [] });

    const store = await getStore();
    if (!resetState) {
      const snap = store.getState();
      resetState = {
        workspaces: [],
        workspaceIntegrations: {},
        sessionExternalTasks: {},
        currentWorkspaceId: null,
        sessions: [],
        archivedSessions: {},
        currentSessionId: null,
        settings: {},
        sessionSummary: null,
        providerStatus: null,
        cursorStatus: null,
        codexStatus: null,
        authResults: null,
        providers: snap.providers,
        hydrated: false,
        bootPhase: 'pending',
        error: null,
        transcripts: {},
        messages: {},
        sessionWorktrees: {},
        sessionBranches: {},
        sessionTelemetry: {},
        workspaceSummary: null,
        sessionSlots: {},
        slotHistory: {},
        summarizerStatus: {},
        budgetRules: [],
        sessionBudgets: {},
        providerSpendBreakdown: [],
        budgetAlerts: [],
        skills: {},
        projectScripts: {},
        scriptRuns: {},
        phaseTemplates: {},
        sessionWorkflows: {},
        sessionPhaseRuns: {},
        selectedAgentId: {},
        agentRunHistory: {},
        agentTurnState: {},
        unknownPayloadCounts: {},
        detectedEditors: [],
        workspaceOverrides: {},
        sessionOverrides: {},
        unreadWorkspaceIds: new Set<WorkspaceId>(),
        githubStatus: null,
        sessionGithub: {},
        volatilePermissionAllows: new Set<string>(),
        agentModelOverride: {},
        agentKindOverride: {},
        agentDraft: {},
        diffComments: {},
        notifications: [],
        sessionPlans: {},
        sessionNudges: {},
        planConsumptions: {},
        sessionOpenQuestions: {},
        sessionLoading: {},
        sessionViewPrefs: {},
        terminalSessions: {},
      };
    }
    store.setState(resetState as never);
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('boot', () => {
    it('initial state defaults to pending bootPhase and not hydrated', async () => {
      const store = await getStore();
      expect(store.getState().bootPhase).toBe('pending');
      expect(store.getState().hydrated).toBe(false);
    });

    it('after hydrate the boot phase reaches ready (no workspaces configured)', async () => {
      const store = await getStore();
      await store.getState().hydrate();
      const s = store.getState();
      expect(s.hydrated).toBe(true);
      expect(s.bootPhase).toBe('ready');
    });

    it('reattaches live scripts and terminals during hydration', async () => {
      const store = await getStore();

      await store.getState().hydrate();

      await vi.waitFor(() => {
        expect(invokeSpy).toHaveBeenCalledWith('workspace_script_list_live');
        expect(invokeSpy).toHaveBeenCalledWith('terminal_list_live');
      });
    });

    it('reports the elapsed time of every boot breadcrumb that awaits work', async () => {
      type BreadcrumbDetailParams = { phase: string };

      const store = await getStore();
      let clock = 0;
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
      runDbMigrationsSpy.mockImplementationOnce(async () => {
        clock = 10;
      });
      dbGetSettingSpy.mockImplementation(async (_db: unknown, key: string) => {
        if (key === SETTING_EDITOR_BINARY) {
          clock = 1_010;
        }
        return null;
      });
      listProviderCredentialsSpy.mockImplementationOnce(async () => {
        clock = 1_040;
        return [];
      });
      listWorkspacesSpy.mockImplementationOnce(async () => {
        clock = 1_105;
        return [];
      });

      await store.getState().hydrate();
      nowSpy.mockRestore();

      const calls = invokeSpy.mock.calls as unknown as ReadonlyArray<ReadonlyArray<unknown>>;
      const breadcrumbDetail = ({ phase }: BreadcrumbDetailParams): unknown => {
        const call = calls.find(([command, payload]) => {
          if (command !== 'boot_breadcrumb') {
            return false;
          }
          if (typeof payload !== 'object' || payload === null) {
            return false;
          }
          if (!('phase' in payload)) {
            return false;
          }
          return payload.phase === phase;
        });
        if (call === undefined) {
          return undefined;
        }
        const payload = call[1];
        if (typeof payload !== 'object' || payload === null) {
          return undefined;
        }
        if (!('detail' in payload)) {
          return undefined;
        }
        return payload.detail;
      };

      expect(breadcrumbDetail({ phase: 'migrating' })).toBe('ms=10');
      expect(breadcrumbDetail({ phase: 'loading-settings' })).toBe('ms=1000');
      expect(breadcrumbDetail({ phase: 'detecting-cli' })).toBe('ms=30');
      expect(breadcrumbDetail({ phase: 'loading-workspaces' })).toBe('ms=65');
      expect(breadcrumbDetail({ phase: 'ready' })).toBe('ms=1105,ok');
    });

    it('joins the in-flight hydration instead of starting a second run on retry', async () => {
      const store = await getStore();
      let releaseFirst: () => void = () => undefined;
      listWorkspacesSpy.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve([]);
          }),
      );

      void store.getState().hydrate();
      await vi.waitFor(() => {
        expect(listWorkspacesSpy).toHaveBeenCalledOnce();
      });

      const retry = store.getState().retryHydrate();
      releaseFirst();
      await retry;

      expect(listWorkspacesSpy).toHaveBeenCalledOnce();
      expect(runDbMigrationsSpy).toHaveBeenCalledOnce();
      expect(store.getState().bootPhase).toBe('ready');
    });

    it('runs the database migrations once when two hydrations start concurrently', async () => {
      const store = await getStore();

      await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);

      expect(runDbMigrationsSpy).toHaveBeenCalledOnce();
      expect(store.getState().bootPhase).toBe('ready');
    });

    it('still restarts hydration when retry runs after a failed attempt', async () => {
      const store = await getStore();
      listWorkspacesSpy.mockRejectedValueOnce(new Error('boom'));

      await store.getState().hydrate();
      expect(store.getState().bootPhase).toBe('error');

      await store.getState().retryHydrate();

      expect(store.getState().bootPhase).toBe('ready');
      expect(runDbMigrationsSpy).toHaveBeenCalledTimes(2);
    });

    it('survives a boot breadcrumb command that throws synchronously', async () => {
      const store = await getStore();
      invokeSpy.mockImplementation(((command: unknown) => {
        if (command === 'boot_breadcrumb') {
          throw new Error('breadcrumb sink exploded');
        }
        return Promise.resolve(null);
      }) as never);

      await store.getState().hydrate();

      expect(store.getState().bootPhase).toBe('ready');
      expect(store.getState().error).toBeNull();
    });

    it('never leaves the breadcrumb rejection unhandled', async () => {
      const store = await getStore();
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      invokeSpy.mockImplementation(((command: unknown) => {
        if (command === 'boot_breadcrumb') {
          return {
            then: (_onFulfilled: unknown, onRejected: (reason: unknown) => void) => {
              onRejected(new Error('breadcrumb sink exploded'));
            },
          };
        }
        return Promise.resolve(null);
      }) as never);

      await store.getState().hydrate();
      await new Promise((resolve) => setImmediate(resolve));
      process.off('unhandledRejection', unhandled);

      expect(unhandled).not.toHaveBeenCalled();
      expect(store.getState().bootPhase).toBe('ready');
    });

    it('loads notifications at boot without waiting for the bell to mount', async () => {
      const store = await getStore();
      await store.getState().hydrate();
      expect(listNotificationsSpy).toHaveBeenCalled();
    });

    it('hydrates the changelog seen marker before the boot phase reaches ready', async () => {
      const store = await getStore();
      let bootPhaseAtCall: string | null = null;
      dbGetSettingSpy.mockImplementation(async (_db: unknown, key: string) => {
        if (key === SETTING_CHANGELOG_SEEN) {
          bootPhaseAtCall = store.getState().bootPhase;
        }
        return null;
      });

      await store.getState().hydrate();

      expect(bootPhaseAtCall).not.toBeNull();
      expect(bootPhaseAtCall).not.toBe('ready');
    });

    it('applies the qa deciding preview named by the environment at boot', async () => {
      const store = await getStore();
      store.setState({ orchestratingWorkflowRuns: {} } as never);
      invokeSpy.mockImplementation(async (command: unknown) => {
        if (command === 'qa_deciding_workflow_runs') {
          return ['run-qa-preview'];
        }
        return null;
      });

      await store.getState().hydrate();

      expect(store.getState().orchestratingWorkflowRuns).toEqual({ 'run-qa-preview': true });
    });

    it('offers to clean the session folders left behind on disk', async () => {
      const store = await getStore();
      listWorkspacesSpy.mockResolvedValueOnce([
        {
          id: 'ws-1' as WorkspaceId,
          name: 'demo',
          slug: 'demo',
          sessionsRoot: '/repo',
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
          createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
          updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        },
      ]);
      listProjectsForWorkspaceSpy.mockResolvedValueOnce([
        {
          id: 'project-1' as ProjectId,
          workspaceId: 'ws-1' as WorkspaceId,
          name: 'demo',
          rootPath: '/repo',
          kind: 'repo',
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
          createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
          updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        },
      ]);
      scanOrphanWorktreesSpy.mockResolvedValueOnce([
        { path: '/repo/.goodboy/worktrees/gb-ghost', name: 'gb-ghost', sizeBytes: 2048 },
      ]);

      await store.getState().hydrate();

      await vi.waitFor(() => {
        expect(store.getState().orphanWorktrees['ws-1']).toHaveLength(1);
      });
      expect(insertNotificationSpy).toHaveBeenCalled();
    });
  });
});
