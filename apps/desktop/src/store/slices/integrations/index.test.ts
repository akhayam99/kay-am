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
  IntegrationCredential,
  IntegrationCredentialId,
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
const getIntegrationBindingSpy = vi.fn(async () => null as IntegrationBinding | null);
const listIntegrationBindingsForWorkspaceSpy = vi.fn(
  async () => [] as ReadonlyArray<IntegrationBinding>,
);
const deleteIntegrationBindingSpy = vi.fn(async () => undefined);
const deleteIntegrationBindingsForProviderSpy = vi.fn(async () => undefined);
const upsertIntegrationCredentialSpy = vi.fn(async () => undefined);
const deleteIntegrationCredentialSpy = vi.fn(async () => undefined);
const listIntegrationCredentialsSpy = vi.fn(async () => [] as ReadonlyArray<IntegrationCredential>);
const countWorkspacesPerIntegrationCredentialSpy = vi.fn(
  async () => ({}) as Record<string, number>,
);
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
  getIntegrationBinding: getIntegrationBindingSpy,
  upsertIntegrationBinding: upsertIntegrationBindingSpy,
  deleteIntegrationBinding: deleteIntegrationBindingSpy,
  deleteIntegrationBindingsForProvider: deleteIntegrationBindingsForProviderSpy,
  upsertIntegrationCredential: upsertIntegrationCredentialSpy,
  deleteIntegrationCredential: deleteIntegrationCredentialSpy,
  listIntegrationCredentials: listIntegrationCredentialsSpy,
  countWorkspacesPerIntegrationCredential: countWorkspacesPerIntegrationCredentialSpy,
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

const linearValidateConnectionSpy = vi.fn();
const linearConnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/linear/client', () => ({
  linearValidateConnection: linearValidateConnectionSpy,
  linearConnect: linearConnectSpy,
}));

const sentryValidateConnectionSpy = vi.fn();
const sentryConnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/sentry/client', () => ({
  sentryValidateConnection: sentryValidateConnectionSpy,
  sentryConnect: sentryConnectSpy,
}));

const gitlabValidateConnectionSpy = vi.fn();
const gitlabConnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/gitlab/client', () => ({
  gitlabValidateConnection: gitlabValidateConnectionSpy,
  gitlabConnect: gitlabConnectSpy,
  gitlabFetchAssignedIssues: vi.fn(async () => []),
  issueIdentifier: vi.fn(),
}));

const jiraValidateConnectionSpy = vi.fn();
const jiraConnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/jira/client', () => ({
  jiraValidateConnection: jiraValidateConnectionSpy,
  jiraConnect: jiraConnectSpy,
  jiraListIssues: vi.fn(async () => []),
}));

const slackValidateConnectionSpy = vi.fn();
const slackConnectSpy = vi.fn(async () => undefined);

vi.mock('../../../features/integrations/slack/client', () => ({
  slackValidateConnection: slackValidateConnectionSpy,
  slackConnect: slackConnectSpy,
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
const PROJECT_ID = 'project-1' as ProjectId;
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

const buildProject = (): Project => ({
  id: PROJECT_ID,
  workspaceId: WS_ID,
  name: 'repo',
  rootPath: '/tmp/repo',
  kind: 'repo',
  overrides: buildWorkspace().overrides,
  createdAt: NOW,
  updatedAt: NOW,
});

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
    getIntegrationBindingSpy.mockResolvedValue(null);
    listDiffCommentsSpy.mockResolvedValue([]);
    dbGetSettingSpy.mockResolvedValue(null);
    ghStatusSpy.mockResolvedValue({ available: true, mode: 'gh-cli', scopes: [] });

    const store = await getStore();
    if (!resetState) {
      const snap = store.getState();
      resetState = {
        workspaces: [],
        projects: [buildProject()],
        workspaceIntegrations: {},
        integrationCredentials: [],
        integrationCredentialUsage: {},
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
  describe('integrations', () => {
    const CRED_ID = 'cred-1' as IntegrationCredentialId;

    const linearRow = (): IntegrationBinding => ({
      id: 'i-1' as IntegrationBindingId,
      workspaceId: WS_ID,
      projectId: null,
      provider: 'linear',
      config: { workspaceUrlKey: 'k', viewerUserId: 'u', viewerName: 'n' },
      credentialId: CRED_ID,
      createdAt: NOW,
      updatedAt: NOW,
    });

    it('loadIntegrations caches rows keyed by workspaceId', async () => {
      const store = await getStore();
      const integ = linearRow();
      listIntegrationBindingsForWorkspaceSpy.mockResolvedValueOnce([integ]);
      await store.getState().loadIntegrations(WS_ID);
      expect(store.getState().workspaceIntegrations[WS_ID]).toEqual([integ]);
    });

    it('loadIntegrationCredentials caches the global keys and how many projects hold each', async () => {
      const store = await getStore();
      const credential: IntegrationCredential = {
        id: CRED_ID,
        provider: 'linear',
        label: 'tester',
        account: 'linear.app/org',
        createdAt: NOW,
        updatedAt: NOW,
      };
      listIntegrationCredentialsSpy.mockResolvedValueOnce([credential]);
      countWorkspacesPerIntegrationCredentialSpy.mockResolvedValueOnce({ [CRED_ID]: 2 });

      await store.getState().loadIntegrationCredentials();

      expect(store.getState().integrationCredentials).toEqual([credential]);
      expect(store.getState().integrationCredentialUsage).toEqual({ [CRED_ID]: 2 });
    });

    it('connectLinear writes a credential of its own and points the workspace row at it', async () => {
      const store = await getStore();
      linearValidateConnectionSpy.mockResolvedValueOnce({
        id: 'viewer-1',
        name: 'tester',
        organization: { urlKey: 'org' },
      });
      const out = await store
        .getState()
        .connectLinear({ workspaceId: WS_ID, token: 'tok', credentialId: null });
      expect(out.id).toBe('viewer-1');
      expect(upsertIntegrationCredentialSpy).toHaveBeenCalledTimes(1);
      expect(upsertIntegrationBindingSpy).toHaveBeenCalledTimes(1);
      const cached = store.getState().workspaceIntegrations[WS_ID];
      const linear = cached?.find((i) => i.provider === 'linear');
      expect(linear?.credentialId).toBeDefined();
      expect(linear?.credentialId).not.toBe(`goodboy.workspace.${WS_ID}.linear`);
      const stored = store.getState().integrationCredentials[0];
      expect(stored?.label).toBe('tester');
      expect(stored?.account).toBe('linear.app/org');
    });

    it('connectLinear on a chosen credential sends no token across the boundary and writes no second credential', async () => {
      const store = await getStore();
      linearValidateConnectionSpy.mockResolvedValueOnce({
        id: 'viewer-1',
        name: 'tester',
        organization: { urlKey: 'org' },
      });

      await store
        .getState()
        .connectLinear({ workspaceId: WS_ID, token: 'ignored', credentialId: CRED_ID });

      expect(linearValidateConnectionSpy).toHaveBeenCalledWith(CRED_ID, null);
      expect(linearConnectSpy).toHaveBeenCalledWith(CRED_ID, null);
      expect(upsertIntegrationCredentialSpy).not.toHaveBeenCalled();
      const linear = store
        .getState()
        .workspaceIntegrations[WS_ID]?.find((i) => i.provider === 'linear');
      expect(linear?.credentialId).toBe(CRED_ID);
    });

    it('disconnectIntegration drops the workspace row and never touches the key', async () => {
      const store = await getStore();
      store.setState({ workspaceIntegrations: { [WS_ID]: [linearRow()] } });

      await store.getState().disconnectIntegration({ workspaceId: WS_ID, provider: 'linear' });

      expect(deleteIntegrationBindingsForProviderSpy).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_ID, provider: 'linear' }),
      );
      expect(deleteIntegrationCredentialSpy).not.toHaveBeenCalled();
      expect(store.getState().workspaceIntegrations[WS_ID]).toEqual([]);
    });

    it('disconnectIntegration leaves the other providers of the workspace alone', async () => {
      const store = await getStore();
      const sentry: IntegrationBinding = {
        id: 'sentry-1' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'sentry',
        config: { org: 'goodboy', project: 'desktop' },
        credentialId: 'cred-sentry' as IntegrationCredentialId,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const linear = linearRow();
      store.setState({ workspaceIntegrations: { [WS_ID]: [linear, sentry] } });

      await store.getState().disconnectIntegration({ workspaceId: WS_ID, provider: 'sentry' });

      expect(store.getState().workspaceIntegrations[WS_ID]).toEqual([linear]);
    });

    it('forgetIntegrationCredential refuses while another project still holds the key', async () => {
      const store = await getStore();
      store.setState({ integrationCredentialUsage: { [CRED_ID]: 1 } });

      await expect(
        store.getState().forgetIntegrationCredential({ credentialId: CRED_ID }),
      ).rejects.toThrow(/still uses this key/);

      expect(deleteIntegrationCredentialSpy).not.toHaveBeenCalled();
    });

    it('forgetIntegrationCredential removes the row and the secret once nothing references it', async () => {
      const store = await getStore();
      const credential: IntegrationCredential = {
        id: CRED_ID,
        provider: 'linear',
        label: 'tester',
        account: 'linear.app/org',
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({ integrationCredentials: [credential], integrationCredentialUsage: {} });

      await store.getState().forgetIntegrationCredential({ credentialId: CRED_ID });

      expect(deleteIntegrationCredentialSpy).toHaveBeenCalledWith(expect.anything(), CRED_ID);
      expect(store.getState().integrationCredentials).toEqual([]);
    });

    it('connectSentry derives the project config and labels the credential by organization', async () => {
      const store = await getStore();
      sentryValidateConnectionSpy.mockResolvedValueOnce({
        slug: 'desktop',
        name: 'Desktop',
        organization: { slug: 'goodboy', name: 'Goodboy' },
      });
      const out = await store.getState().connectSentry({
        workspaceId: WS_ID,
        token: 'tok',
        org: 'goodboy',
        project: 'desktop',
        credentialId: null,
      });
      expect(out.slug).toBe('desktop');
      expect(sentryValidateConnectionSpy).toHaveBeenCalledWith(
        expect.any(String),
        'tok',
        'goodboy',
        'desktop',
      );
      const sentry = store
        .getState()
        .workspaceIntegrations[WS_ID]?.find((i) => i.provider === 'sentry');
      expect(sentry?.config).toEqual({
        org: 'goodboy',
        project: 'desktop',
        projectName: 'Desktop',
        orgName: 'Goodboy',
      });
      expect(store.getState().integrationCredentials[0]?.account).toBe('goodboy');
    });

    it('connectSentry reuses an existing row id and createdAt on reconnect', async () => {
      const store = await getStore();
      const existing: IntegrationBinding = {
        id: 'sentry-old' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'sentry',
        config: { org: 'goodboy', project: 'old', projectName: 'Old' },
        credentialId: CRED_ID,
        createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
      };
      getIntegrationBindingSpy.mockResolvedValueOnce(existing);
      store.setState({ workspaceIntegrations: { [WS_ID]: [existing] } });
      sentryValidateConnectionSpy.mockResolvedValueOnce({
        slug: 'new',
        name: 'New',
        organization: { slug: 'goodboy', name: 'Goodboy' },
      });
      await store.getState().connectSentry({
        workspaceId: WS_ID,
        token: 'tok',
        org: 'goodboy',
        project: 'new',
        credentialId: CRED_ID,
      });
      const rows = (store.getState().workspaceIntegrations[WS_ID] ?? []).filter(
        (i) => i.provider === 'sentry',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('sentry-old');
      expect(rows[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect((rows[0]?.config as { project: string }).project).toBe('new');
    });

    it('connectSentry preserves a coexisting linear row', async () => {
      const store = await getStore();
      store.setState({ workspaceIntegrations: { [WS_ID]: [linearRow()] } });
      sentryValidateConnectionSpy.mockResolvedValueOnce({
        slug: 'desktop',
        name: 'Desktop',
        organization: { slug: 'goodboy', name: 'Goodboy' },
      });
      await store.getState().connectSentry({
        workspaceId: WS_ID,
        token: 'tok',
        org: 'goodboy',
        project: 'desktop',
        credentialId: null,
      });
      const providers = (store.getState().workspaceIntegrations[WS_ID] ?? [])
        .map((i) => i.provider)
        .sort();
      expect(providers).toEqual(['linear', 'sentry']);
    });

    it('connectSentry propagates a backend error and leaves cache untouched', async () => {
      const store = await getStore();
      sentryValidateConnectionSpy.mockRejectedValueOnce(new Error('invalid token'));
      await expect(
        store.getState().connectSentry({
          workspaceId: WS_ID,
          token: 'bad',
          org: 'goodboy',
          project: 'desktop',
          credentialId: null,
        }),
      ).rejects.toThrow('invalid token');
      expect(upsertIntegrationBindingSpy).not.toHaveBeenCalled();
      expect(upsertIntegrationCredentialSpy).not.toHaveBeenCalled();
      expect(store.getState().workspaceIntegrations[WS_ID]).toBeUndefined();
    });

    it('connectGitlab carries host into the config and labels the credential by host', async () => {
      const store = await getStore();
      gitlabValidateConnectionSpy.mockResolvedValueOnce({
        id: 99,
        username: 'amin',
        name: 'Amin K',
      });
      const out = await store.getState().connectGitlab({
        workspaceId: WS_ID,
        host: 'https://gitlab.example.com',
        token: 'tok',
        credentialId: null,
      });
      expect(out.id).toBe(99);
      expect(gitlabValidateConnectionSpy).toHaveBeenCalledWith(
        expect.any(String),
        'https://gitlab.example.com',
        'tok',
      );
      const cached = store
        .getState()
        .workspaceIntegrations[WS_ID]?.find((i) => i.provider === 'gitlab');
      expect(cached?.config).toEqual({
        userName: 'Amin K',
        userId: '99',
        host: 'https://gitlab.example.com',
      });
      expect(store.getState().integrationCredentials[0]?.account).toBe(
        'https://gitlab.example.com',
      );
    });

    it('connectGitlab preserves id + createdAt and refreshes host on reconnect', async () => {
      const store = await getStore();
      const existing: IntegrationBinding = {
        id: 'gl-keep' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'gitlab',
        config: { userName: 'old', userId: '1', host: 'https://gitlab.com' },
        credentialId: CRED_ID,
        createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
      };
      getIntegrationBindingSpy.mockResolvedValueOnce(existing);
      store.setState({ workspaceIntegrations: { [WS_ID]: [existing] } });
      gitlabValidateConnectionSpy.mockResolvedValueOnce({
        id: 2,
        username: 'amin',
        name: 'Amin K',
      });
      await store.getState().connectGitlab({
        workspaceId: WS_ID,
        host: 'https://self.hosted',
        token: 'tok2',
        credentialId: CRED_ID,
      });
      const gitlab = (store.getState().workspaceIntegrations[WS_ID] ?? []).filter(
        (i) => i.provider === 'gitlab',
      );
      expect(gitlab).toHaveLength(1);
      expect(gitlab[0]?.id).toBe('gl-keep');
      expect(gitlab[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(gitlab[0]?.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
      expect((gitlab[0]?.config as { host: string }).host).toBe('https://self.hosted');
    });

    it('connectJira caches the site, project and account details it validated', async () => {
      const store = await getStore();
      jiraValidateConnectionSpy.mockResolvedValueOnce({
        accountId: 'acc-7',
        displayName: 'Grace Hopper',
      });
      const out = await store.getState().connectJira({
        workspaceId: WS_ID,
        siteUrl: 'https://acme.atlassian.net',
        email: 'grace@acme.com',
        projectKey: 'ENG',
        apiToken: 'ATATT-x',
        credentialId: null,
      });
      expect(out.accountId).toBe('acc-7');
      const cached = store
        .getState()
        .workspaceIntegrations[WS_ID]?.find((i) => i.provider === 'jira');
      expect(cached?.config).toEqual({
        accountId: 'acc-7',
        displayName: 'Grace Hopper',
        siteUrl: 'https://acme.atlassian.net',
        email: 'grace@acme.com',
        projectKey: 'ENG',
      });
      expect(store.getState().integrationCredentials[0]?.account).toBe('grace@acme.com');
    });

    it('connectJira keeps the row identity and refreshes the project on reconnect', async () => {
      const store = await getStore();
      const existing: IntegrationBinding = {
        id: 'ji-keep' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'jira',
        config: {
          siteUrl: 'https://acme.atlassian.net',
          email: 'grace@acme.com',
          projectKey: 'OLD',
        },
        credentialId: CRED_ID,
        createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
      };
      getIntegrationBindingSpy.mockResolvedValueOnce(existing);
      store.setState({ workspaceIntegrations: { [WS_ID]: [existing] } });
      jiraValidateConnectionSpy.mockResolvedValueOnce({
        accountId: 'acc-7',
        displayName: 'Grace Hopper',
      });
      await store.getState().connectJira({
        workspaceId: WS_ID,
        siteUrl: 'https://acme.atlassian.net',
        email: 'grace@acme.com',
        projectKey: 'ENG',
        apiToken: null,
        credentialId: CRED_ID,
      });
      const rows = (store.getState().workspaceIntegrations[WS_ID] ?? []).filter(
        (i) => i.provider === 'jira',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('ji-keep');
      expect(rows[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect((rows[0]?.config as { projectKey: string }).projectKey).toBe('ENG');
    });

    it('connectSlack probes the token, stores it, then caches the team it answered with', async () => {
      const store = await getStore();
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });

      const out = await store
        .getState()
        .connectSlack({ workspaceId: WS_ID, botToken: ' xoxp-secret ', credentialId: null });

      expect(out.teamId).toBe('T01');
      expect(slackValidateConnectionSpy).toHaveBeenCalledWith({
        credentialId: expect.any(String),
        botToken: ' xoxp-secret ',
      });
      const cached = store
        .getState()
        .workspaceIntegrations[WS_ID]?.find((i) => i.provider === 'slack');
      expect(cached?.config).toEqual({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });
      expect(cached?.credentialId).toBeDefined();
    });

    it('connectSlack writes the database row before the keychain, so a failure between them never orphans a live token', async () => {
      const store = await getStore();
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });

      await store
        .getState()
        .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-secret', credentialId: null });

      const dbCallOrder = upsertIntegrationBindingSpy.mock.invocationCallOrder[0];
      const keychainCallOrder = slackConnectSpy.mock.invocationCallOrder[0];
      expect(dbCallOrder).toBeDefined();
      expect(keychainCallOrder).toBeDefined();
      expect(dbCallOrder as number).toBeLessThan(keychainCallOrder as number);
    });

    it('connectSlack rolls back both fresh rows when the keychain write fails', async () => {
      const store = await getStore();
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });
      slackConnectSpy.mockRejectedValueOnce(new Error('keychain unavailable'));

      await expect(
        store
          .getState()
          .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-secret', credentialId: null }),
      ).rejects.toThrow(/keychain unavailable/);

      expect(upsertIntegrationBindingSpy).toHaveBeenCalledTimes(1);
      expect(deleteIntegrationBindingSpy).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: WS_ID, provider: 'slack', projectId: null }),
      );
      expect(deleteIntegrationCredentialSpy).toHaveBeenCalledTimes(1);
      expect(store.getState().workspaceIntegrations[WS_ID] ?? []).toEqual([]);
    });

    it('connectSlack restores the database row when the in-memory store is stale', async () => {
      const store = await getStore();
      const existing: IntegrationBinding = {
        id: 'sl-db-existing' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'slack',
        config: { teamId: 'T00', teamName: 'Old', botUserId: 'U00' },
        credentialId: CRED_ID,
        createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
      };
      getIntegrationBindingSpy.mockResolvedValueOnce(existing);
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'NewTeam',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });
      slackConnectSpy.mockRejectedValueOnce(new Error('keychain unavailable'));

      await expect(
        store
          .getState()
          .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-new', credentialId: CRED_ID }),
      ).rejects.toThrow(/keychain unavailable/);

      expect(deleteIntegrationBindingSpy).not.toHaveBeenCalled();
      expect(deleteIntegrationCredentialSpy).not.toHaveBeenCalled();
      expect(upsertIntegrationBindingSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ binding: existing }),
      );
    });

    it('connectSlack preserves the keychain error when database rollback fails', async () => {
      const store = await getStore();
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });
      slackConnectSpy.mockRejectedValueOnce(new Error('keychain unavailable'));
      deleteIntegrationBindingSpy.mockRejectedValueOnce(new Error('rollback failed'));

      await expect(
        store
          .getState()
          .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-secret', credentialId: null }),
      ).rejects.toThrow(/keychain unavailable/);
    });

    it('connectSlack never stores a token the probe rejected', async () => {
      const store = await getStore();
      slackValidateConnectionSpy.mockRejectedValueOnce(new Error('invalid_auth'));

      await expect(
        store
          .getState()
          .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-bad', credentialId: null }),
      ).rejects.toThrow(/invalid_auth/);

      expect(slackConnectSpy).not.toHaveBeenCalled();
      expect(upsertIntegrationBindingSpy).not.toHaveBeenCalled();
      expect(store.getState().workspaceIntegrations[WS_ID] ?? []).toEqual([]);
    });

    it('connectSlack keeps the row identity when the same workspace reconnects', async () => {
      const store = await getStore();
      const existing: IntegrationBinding = {
        id: 'sl-keep' as IntegrationBindingId,
        workspaceId: WS_ID,
        projectId: null,
        provider: 'slack',
        config: { teamId: 'T00', teamName: 'Old', botUserId: 'U00' },
        credentialId: CRED_ID,
        createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
        updatedAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
      };
      getIntegrationBindingSpy.mockResolvedValueOnce(existing);
      store.setState({ workspaceIntegrations: { [WS_ID]: [existing] } });
      slackValidateConnectionSpy.mockResolvedValueOnce({
        teamId: 'T01',
        teamName: 'Acme',
        botUserId: 'U09',
        botUserName: 'goodboy',
      });

      await store
        .getState()
        .connectSlack({ workspaceId: WS_ID, botToken: 'xoxp-secret', credentialId: CRED_ID });

      const rows = (store.getState().workspaceIntegrations[WS_ID] ?? []).filter(
        (i) => i.provider === 'slack',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe('sl-keep');
      expect(rows[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect((rows[0]?.config as { teamName: string }).teamName).toBe('Acme');
    });

    it('resolveBinding prefers the project override over the workspace binding', async () => {
      const store = await getStore();
      const workspaceLevel = linearRow();
      const override: IntegrationBinding = {
        ...linearRow(),
        id: 'i-override' as IntegrationBindingId,
        projectId: PROJECT_ID,
        credentialId: 'cred-override' as IntegrationCredentialId,
      };
      store.setState({ workspaceIntegrations: { [WS_ID]: [workspaceLevel, override] } });

      const resolved = store
        .getState()
        .resolveBinding({ workspaceId: WS_ID, provider: 'linear', projectId: PROJECT_ID });
      expect(resolved?.id).toBe('i-override');

      const fallback = store.getState().resolveBinding({ workspaceId: WS_ID, provider: 'linear' });
      expect(fallback?.id).toBe('i-1');
    });

    it('resolveBinding falls back to the workspace binding for a project with no override', async () => {
      const store = await getStore();
      store.setState({ workspaceIntegrations: { [WS_ID]: [linearRow()] } });

      const resolved = store.getState().resolveBinding({
        workspaceId: WS_ID,
        provider: 'linear',
        projectId: 'project-elsewhere' as ProjectId,
      });
      expect(resolved?.id).toBe('i-1');

      const missing = store.getState().resolveBinding({ workspaceId: WS_ID, provider: 'slack' });
      expect(missing).toBeNull();
    });

    it('disconnectGithub clears the workspace-scoped keychain token only', async () => {
      const store = await getStore();

      await store.getState().disconnectGithub({ workspaceId: WS_ID });

      expect(ghClearTokenSpy).toHaveBeenCalledWith(WS_ID);
      expect(deleteIntegrationBindingSpy).not.toHaveBeenCalled();
      expect(deleteIntegrationBindingsForProviderSpy).not.toHaveBeenCalled();
    });
  });
});
