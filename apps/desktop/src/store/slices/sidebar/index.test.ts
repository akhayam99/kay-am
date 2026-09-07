// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
}));

const dbSetSettingSpy = vi.fn(async () => undefined);
const dbGetSettingSpy: ReturnType<typeof vi.fn> = vi.fn<() => Promise<string | null>>(
  async () => null,
);
const insertNotificationSpy = vi.fn(async () => undefined);
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
  listProjectScripts: listProjectScriptsSpy,
  upsertProjectScript: upsertProjectScriptSpy,
  deleteProjectScript: deleteProjectScriptSpy,
  upsertContextSlot: vi.fn(async () => undefined),
  listOpenQuestionsForSession: vi.fn(async () => []),
  insertNudgeEvent: insertNudgeEventSpy,
  updateNudgeEventOutcome: updateNudgeOutcomeSpy,
  insertNotification: insertNotificationSpy,
  listNotifications: vi.fn(async () => []),
  countNotifications: vi.fn(async () => ({ total: 0, unread: 0 })),
  NOTIFICATION_LIST_LIMIT: 200,
  markAllNotificationsRead: vi.fn(async () => undefined),
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
}));

vi.mock('../../../shared/lib/db', () => ({
  runDbMigrations: vi.fn(async () => undefined),
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

vi.mock('../../../features/worktree/worktree', () => ({
  createWorktree: createWorktreeSpy,
  removeWorktree: removeWorktreeSpy,
  changeWorktreeBranch: changeWorktreeBranchSpy,
  worktreeChangedFiles: vi.fn(async () => []),
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
  invokeScriptCancel: vi.fn(async () => undefined),
  listenScriptOutput: vi.fn(async () => () => undefined),
  listenScriptExit: vi.fn(async () => () => undefined),
}));

vi.mock('../../../features/terminal/terminal', () => ({
  invokeTerminalOpen: vi.fn(async () => undefined),
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

  describe('sidebar', () => {
    it('setPanelSectionExpanded merges per-session without clobbering siblings', async () => {
      const store = await getStore();
      store.getState().setPanelSectionExpanded(SESSION_ID, 'workflow', true);
      store.getState().setPanelSectionExpanded(SESSION_ID, 'agents', false);
      store.getState().setPanelSectionExpanded(SESSION_ID_2, 'scripts', true);
      const state = store.getState().sessionPanelExpanded;
      expect(state[SESSION_ID]).toEqual({ workflow: true, agents: false });
      expect(state[SESSION_ID_2]).toEqual({ scripts: true });
    });

    it('setPanelSectionExpanded leaves absent values to fall back', async () => {
      const store = await getStore();
      store.getState().setPanelSectionExpanded(SESSION_ID, 'workflow', true);
      const state = store.getState().sessionPanelExpanded;
      expect(state[SESSION_ID]?.scripts ?? 'fallback').toBe('fallback');
    });

    it('refreshUnreadWorkspaces stores the set returned by the invoker', async () => {
      const store = await getStore();
      invokeWorkspacesWithUnreadSpy.mockResolvedValueOnce([WS_ID, WS_ID_2]);
      await store.getState().refreshUnreadWorkspaces();
      const s = store.getState().unreadWorkspaceIds;
      expect(s.has(WS_ID)).toBe(true);
      expect(s.has(WS_ID_2)).toBe(true);
    });

    it('refreshUnreadWorkspaces swallows errors and leaves state untouched', async () => {
      const store = await getStore();
      const seeded = new Set<WorkspaceId>([WS_ID]);
      store.setState({ unreadWorkspaceIds: seeded });
      invokeWorkspacesWithUnreadSpy.mockRejectedValueOnce(new Error('boom'));
      await store.getState().refreshUnreadWorkspaces();
      expect(store.getState().unreadWorkspaceIds).toBe(seeded);
    });
  });
});
