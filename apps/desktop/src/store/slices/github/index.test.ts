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
  Project,
  ProjectId,
  PendingResolution,
  PullRequestState,
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
const deletePendingResolutionSpy = vi.fn(async () => undefined);
const listPendingResolutionsForSessionSpy = vi.fn<
  (db: unknown, sessionId: SessionId) => Promise<ReadonlyArray<PendingResolution>>
>(async () => []);
const queuePendingResolutionSpy = vi.fn(async () => undefined);
const markPendingResolutionReplyPostedSpy = vi.fn(async () => undefined);

const resolveMockState = vi.hoisted(() => ({ reset: (): void => {} }));
beforeEach(() => resolveMockState.reset());

vi.mock('@goodboy/db', async () => {
  const queries = (
    await import('../resolve/testing/createResolveQueryMocks')
  ).createResolveQueryMocks();
  resolveMockState.reset = queries.resetResolveQueryMocks;
  return {
    ...queries,
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
    updateSessionWorktreeRepoSlug: vi.fn(async () => undefined),
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
    deletePendingResolution: deletePendingResolutionSpy,
    listPendingResolutionsForSession: listPendingResolutionsForSessionSpy,
    queuePendingResolution: queuePendingResolutionSpy,
    markPendingResolutionReplyPosted: markPendingResolutionReplyPostedSpy,
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
  };
});

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
  worktreeStatus: vi.fn(async () => null),
  listBranchCommits: vi.fn(async () => []),
  worktreeIsAncestor: vi.fn(async () => true),
  worktreeRemoteHead: vi.fn(async () => ''),
  worktreeWriterStatus: vi.fn(async ({ path }: { readonly path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  acquireWorktreeWriter: vi.fn(async ({ path }: { readonly path: string }) => ({
    path,
    holder: 'publisher',
    token: 'token',
    runId: null,
    isGranted: true,
    hasExited: false,
    waiting: [],
  })),
  releaseWorktreeWriter: vi.fn(async ({ path }: { readonly path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
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
const gitPushSpy = vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }));
const resolveThreadSpy = vi.fn(async () => undefined);
const addReplySpy = vi.fn(async () => ({ id: 'reply-id' }));
const detectRepoSlugSpy = vi.fn(async () => null as string | null);
const listPrsForBranchSpy = vi.fn(async () => [] as ReadonlyArray<PullRequestState>);
const fetchLinkedIssuesSpy = vi.fn(async () => []);

vi.mock('../../../features/github/github', () => ({
  ghStatus: ghStatusSpy,
  ghSetToken: ghSetTokenSpy,
  ghClearToken: ghClearTokenSpy,
  gitPush: gitPushSpy,
  tauriGhRunner: { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })) },
  createTauriPrCacheStore: () => ({ get: vi.fn(), upsert: vi.fn(), delete: vi.fn() }),
}));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    detectRepoSlug: detectRepoSlugSpy,
    listPrsForBranch: listPrsForBranchSpy,
    getPrForBranch: vi.fn(async () => null),
    fetchPrDetail: vi.fn(async () => null),
    fetchLinkedIssues: fetchLinkedIssuesSpy,
    resolveReviewThread: resolveThreadSpy,
    addReviewThreadReply: addReplySpy,
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
const PROJECT_ID = 'project-1' as ProjectId;
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

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    workspaceId: WS_ID,
    name: 'repo',
    rootPath: '/tmp/repo',
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
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    workspaceId: WS_ID,
    activeProjectId: PROJECT_ID,
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
        projects: [buildProject()],
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
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: '/tmp/repo',
              repoRoot: '/tmp/repo',
              branch: 'goodboy/topic',
            },
          ],
        },
        sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
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
        sessionResolvedThreads: {},
        sessionResolveThreads: {},
        sessionResolveAttempts: {},
        resolverState: {},
        resolverThreadOutcomes: {},
        sessionPendingResolutions: {},
        sessionProjectPrs: {},
        sessionSelectedPrNumber: {},
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

  describe('github', () => {
    it('refreshGithubStatus stores the status returned by the runner', async () => {
      const store = await getStore();
      ghStatusSpy.mockResolvedValueOnce({
        available: true,
        mode: 'pat',
        user: 'tester',
        scopes: ['repo'],
      });
      await store.getState().refreshGithubStatus();
      expect(store.getState().githubStatus?.mode).toBe('pat');
    });

    it('refreshGithubStatus falls back to an absent status when ghStatus throws', async () => {
      const store = await getStore();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      ghStatusSpy.mockRejectedValueOnce(new Error('boom'));
      await store.getState().refreshGithubStatus();
      expect(store.getState().githubStatus?.available).toBe(false);
      expect(store.getState().githubStatus?.mode).toBe('absent');
      warnSpy.mockRestore();
    });

    it('setGithubPat stores the new status', async () => {
      const store = await getStore();
      ghSetTokenSpy.mockResolvedValueOnce({
        available: true,
        mode: 'pat',
        user: 'me',
        scopes: ['repo'],
      });
      const out = await store.getState().setGithubPat('tok');
      expect(out.mode).toBe('pat');
      expect(store.getState().githubStatus?.user).toBe('me');
    });

    it('refreshSessionPr noops without a session branch', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
      });
      await store.getState().refreshSessionPr(SESSION_ID);
      expect(store.getState().sessionGithub[SESSION_ID]).toBeUndefined();
    });

    it('refreshSessionPr noops for a folder project even with a branch', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        projects: [buildProject({ kind: 'folder' })],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
      });
      await store.getState().refreshSessionPr(SESSION_ID);
      expect(store.getState().sessionGithub[SESSION_ID]).toBeUndefined();
    });

    it('keeps selection separate while a new canonical pr surfaces from one list fetch', async () => {
      const store = await getStore();
      const selectedPr = {
        number: 40,
        title: 'Closed selection',
        state: 'closed',
        updatedAt: '2026-07-29T10:00:00Z',
      } as PullRequestState;
      const canonicalPr = {
        ...selectedPr,
        number: 42,
        title: 'New canonical',
        state: 'open',
        updatedAt: '2026-07-30T10:00:00Z',
      } as PullRequestState;
      detectRepoSlugSpy.mockResolvedValueOnce('acme/goodboy');
      listPrsForBranchSpy.mockResolvedValueOnce([canonicalPr, selectedPr]);
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/topic'] },
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: '/tmp/repo/.wt/topic',
              repoRoot: '/tmp/repo',
              branch: 'goodboy/topic',
            },
          ],
        },
        sessionGithub: {
          [SESSION_ID]: {
            pr: selectedPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
        sessionProjectPrs: { [SESSION_ID]: { [PROJECT_ID]: [selectedPr] } },
        sessionSelectedPrNumber: { [SESSION_ID]: selectedPr.number },
      });

      await store.getState().refreshSessionPr(SESSION_ID, { force: true });

      expect(store.getState().sessionGithub[SESSION_ID]?.pr?.number).toBe(canonicalPr.number);
      expect(store.getState().sessionSelectedPrNumber[SESSION_ID]).toBe(selectedPr.number);
      expect(listPrsForBranchSpy).toHaveBeenCalledOnce();
    });

    it('keeps a fetch that lands after an active-project switch out of the session surface', async () => {
      const store = await getStore();
      const otherProjectId = 'project-2' as ProjectId;
      const fetchedPr = {
        number: 42,
        title: 'From the previous mount',
        state: 'open',
        updatedAt: '2026-07-30T10:00:00Z',
      } as PullRequestState;
      detectRepoSlugSpy.mockResolvedValueOnce('acme/goodboy');
      listPrsForBranchSpy.mockImplementationOnce(async () => {
        store.setState((state) => {
          const nextGithub = { ...state.sessionGithub };
          delete nextGithub[SESSION_ID];
          return {
            sessionActiveProject: { [SESSION_ID]: otherProjectId },
            sessionGithub: nextGithub,
          };
        });
        return [fetchedPr];
      });
      store.setState({
        workspaces: [buildWorkspace()],
        projects: [
          buildProject(),
          buildProject({ id: otherProjectId, name: 'api', rootPath: '/tmp/api' }),
        ],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: '/tmp/repo/.wt/topic',
              repoRoot: '/tmp/repo',
              branch: 'goodboy/topic',
            },
            {
              projectId: otherProjectId,
              mountName: 'api',
              worktreePath: '/tmp/api/.wt/topic',
              repoRoot: '/tmp/api',
              branch: 'goodboy/topic',
            },
          ],
        },
      });

      await store.getState().refreshSessionPr(SESSION_ID, { force: true });

      expect(store.getState().sessionGithub[SESSION_ID]).toBeUndefined();
      expect(store.getState().sessionProjectPrs[SESSION_ID]?.[PROJECT_ID]).toEqual([fetchedPr]);
    });

    it('caches the canonical pull request under its repository slug', async () => {
      const store = await getStore();
      const db = await import('@goodboy/db');
      const canonicalPr = {
        number: 42,
        title: 'Ship the impact panel',
        url: 'https://github.com/acme/goodboy/pull/42',
        state: 'open',
        mergeable: true,
        checks: 'success',
        baseBranch: 'main',
        headBranch: 'goodboy/topic',
        isDraft: false,
        reviewDecision: null,
        body: 'a body nobody should cache',
        updatedAt: '2026-07-30T10:00:00Z',
      } as PullRequestState;
      detectRepoSlugSpy.mockResolvedValueOnce('acme/goodboy');
      listPrsForBranchSpy.mockResolvedValueOnce([canonicalPr]);
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/topic'] },
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: '/tmp/repo/.wt/topic',
              repoRoot: '/tmp/repo',
              branch: 'goodboy/topic',
            },
          ],
        },
      });

      await store.getState().refreshSessionPr(SESSION_ID, { force: true });

      expect(vi.mocked(db.updateSessionWorktreeRepoSlug)).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: SESSION_ID,
          worktreePath: '/tmp/repo/.wt/topic',
          repoSlug: 'acme/goodboy',
        }),
      );
      const entry = vi.mocked(db.upsertGithubPrCache).mock.calls[0]?.[1];
      expect(entry).toMatchObject({ branch: 'goodboy/topic', repoSlug: 'acme/goodboy' });
      expect(Object.keys(entry?.pr ?? {}).sort()).toEqual([
        'number',
        'state',
        'title',
        'updatedAt',
        'url',
      ]);
    });

    it('keeps the previous pr list and selection when listing fails', async () => {
      const store = await getStore();
      const previousPr = {
        number: 40,
        title: 'Previous selection',
        state: 'closed',
        updatedAt: '2026-07-29T10:00:00Z',
      } as PullRequestState;
      detectRepoSlugSpy.mockResolvedValueOnce('acme/goodboy');
      listPrsForBranchSpy.mockRejectedValueOnce(new Error('authentication failed'));
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/topic'] },
        sessionProjectPrs: { [SESSION_ID]: { [PROJECT_ID]: [previousPr] } },
        sessionSelectedPrNumber: { [SESSION_ID]: previousPr.number },
      });

      await store.getState().refreshSessionPr(SESSION_ID, { force: true });

      expect(store.getState().sessionProjectPrs[SESSION_ID]?.[PROJECT_ID]).toEqual([previousPr]);
      expect(store.getState().sessionSelectedPrNumber[SESSION_ID]).toBe(previousPr.number);
    });

    it('records the failed attempt so a never-tried session stays distinguishable', async () => {
      const store = await getStore();
      detectRepoSlugSpy.mockRejectedValueOnce(new Error('gh timed out'));
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/topic'] },
      });

      await store.getState().refreshSessionPr(SESSION_ID, { force: true, silent: true });

      const github = store.getState().sessionGithub[SESSION_ID];
      expect(github?.fetchedAt).toBeNull();
      expect(github?.failedAt).not.toBeNull();
      expect(github?.loading).toBe(false);
    });

    it('clears the failed attempt once a later fetch lands', async () => {
      const store = await getStore();
      detectRepoSlugSpy.mockRejectedValueOnce(new Error('gh timed out'));
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'goodboy/topic' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/topic'] },
      });
      await store.getState().refreshSessionPr(SESSION_ID, { force: true, silent: true });
      expect(store.getState().sessionGithub[SESSION_ID]?.failedAt).not.toBeNull();

      detectRepoSlugSpy.mockResolvedValueOnce('acme/goodboy');
      listPrsForBranchSpy.mockResolvedValueOnce([]);
      await store.getState().refreshSessionPr(SESSION_ID, { force: true, silent: true });

      expect(store.getState().sessionGithub[SESSION_ID]?.failedAt).toBeNull();
      expect(store.getState().sessionGithub[SESSION_ID]?.fetchedAt).not.toBeNull();
    });

    it('sweepGithub is a no-op when github is unavailable', async () => {
      const store = await getStore();
      store.setState({
        githubStatus: { available: false, mode: 'absent', scopes: [] } as never,
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'main' },
      });
      store.getState().sweepGithub();
      expect(store.getState().sessionGithub[SESSION_ID]).toBeUndefined();
    });

    it('resolveGithubThread pushes the session branch before replying and resolving', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: '/tmp/repo/.wt/x',
              repoRoot: '/tmp/repo',
              branch: 'ak/feat-x',
            },
          ],
        },
      });
      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { commitSha: 'abcdef1234567890' });
      expect(ok).toBe(true);
      expect(gitPushSpy).toHaveBeenCalledWith('/tmp/repo/.wt/x', 'ak/feat-x', WS_ID, PROJECT_ID);
      const pushOrder = gitPushSpy.mock.invocationCallOrder[0] ?? 0;
      const replyOrder = addReplySpy.mock.invocationCallOrder[0] ?? 0;
      expect(pushOrder).toBeGreaterThan(0);
      expect(replyOrder).toBeGreaterThan(0);
      expect(pushOrder).toBeLessThan(replyOrder);
      expect(resolveThreadSpy).toHaveBeenCalled();
    });

    it('resolveGithubThread leaves the thread open and skips resolve when the push fails', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
      });
      gitPushSpy.mockResolvedValueOnce({
        stdout: '',
        stderr: 'rejected: non-fast-forward',
        exitCode: 1,
      });
      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { commitSha: 'abcdef1234567890' });
      expect(ok).toBe(false);
      expect(
        store.getState().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRT_1'),
      ).toMatchObject({ state: 'fixed', stateReason: expect.stringContaining('non-fast-forward') });
      expect(addReplySpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).not.toHaveBeenCalled();
    });

    it('resolveGithubThread does not push for a reason-only closure', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
      });
      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { reason: 'not applicable' });
      expect(ok).toBe(true);
      expect(gitPushSpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).toHaveBeenCalled();
    });

    it('resolveGithubThread persists first and leaves no orphan row when nothing was posted', async () => {
      const store = await getStore();
      const openPr = {
        number: 5,
        title: 't',
        state: 'open',
        updatedAt: '2026-05-28T00:00:00.000Z',
      } as PullRequestState;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionGithub: {
          [SESSION_ID]: {
            pr: openPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
      });

      const ok = await store.getState().resolveGithubThread(SESSION_ID, 'PRT_1', {});

      expect(ok).toBe(true);
      expect(queuePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        id: expect.any(String),
        sessionId: SESSION_ID,
        prNumber: 5,
        threadId: 'PRT_1',
        commitSha: '',
        reply: null,
        outcome: null,
      });
      expect(addReplySpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).toHaveBeenCalled();
      expect(deletePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        sessionId: SESSION_ID,
        threadId: 'PRT_1',
      });
    });

    it('resolveGithubThread persists the derived verdict for a commit closure, not null', async () => {
      const store = await getStore();
      const openPr = {
        number: 5,
        title: 't',
        state: 'open',
        updatedAt: '2026-05-28T00:00:00.000Z',
      } as PullRequestState;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionGithub: {
          [SESSION_ID]: {
            pr: openPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
      });

      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { commitSha: 'abcdef1234567890' });

      expect(ok).toBe(true);
      expect(queuePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        id: expect.any(String),
        sessionId: SESSION_ID,
        prNumber: 5,
        threadId: 'PRT_1',
        commitSha: 'abcdef1234567890',
        reply: null,
        outcome: 'resolved',
      });
    });

    it('resolveGithubThread persists the derived verdict for a reason-only closure, not null', async () => {
      const store = await getStore();
      const openPr = {
        number: 5,
        title: 't',
        state: 'open',
        updatedAt: '2026-05-28T00:00:00.000Z',
      } as PullRequestState;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionGithub: {
          [SESSION_ID]: {
            pr: openPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
      });

      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { reason: 'not applicable' });

      expect(ok).toBe(true);
      expect(queuePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        id: expect.any(String),
        sessionId: SESSION_ID,
        prNumber: 5,
        threadId: 'PRT_1',
        commitSha: '',
        reply: null,
        outcome: 'wontfix',
      });
    });

    it('resolveGithubThread never clobbers a verdict a caller already queued for the thread', async () => {
      const store = await getStore();
      const openPr = {
        number: 5,
        title: 't',
        state: 'open',
        updatedAt: '2026-05-28T00:00:00.000Z',
      } as PullRequestState;
      const queued = {
        id: 'pending-queued',
        sessionId: SESSION_ID,
        prNumber: 5,
        threadId: 'PRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed with the shared guard',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionGithub: {
          [SESSION_ID]: {
            pr: openPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
        sessionPendingResolutions: { [SESSION_ID]: [queued] },
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([queued]).mockResolvedValueOnce([]);

      const ok = await store.getState().resolveGithubThread(SESSION_ID, 'PRT_1', {});

      expect(ok).toBe(true);
      expect(queuePendingResolutionSpy).not.toHaveBeenCalled();
      expect(deletePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        sessionId: SESSION_ID,
        threadId: 'PRT_1',
      });
    });

    it('resolveAgentThreads pushes once and resolves every resolved outcome', async () => {
      const store = await getStore();
      const refresh = vi.fn(async () => undefined);
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'resolved', commitSha: 'abcdef1234567890' },
          },
        },
        sessionPendingResolutions: {
          [SESSION_ID]: [
            {
              id: 'pending-1',
              sessionId: SESSION_ID,
              prNumber: 1,
              threadId: 'PRRT_1',
              commitSha: 'abcdef1234567890',
              reply: null,
              outcome: 'resolved',
              replyPostedAt: null,
              createdAt: NOW,
            },
            {
              id: 'pending-2',
              sessionId: SESSION_ID,
              prNumber: 1,
              threadId: 'PRRT_2',
              commitSha: 'abcdef1234567890',
              reply: null,
              outcome: 'resolved',
              replyPostedAt: null,
              createdAt: NOW,
            },
          ],
        },
        refreshSessionPrDetail: refresh,
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(gitPushSpy).toHaveBeenCalledTimes(1);
      expect(resolveThreadSpy).toHaveBeenCalledTimes(2);
      expect(deletePendingResolutionSpy).toHaveBeenCalledTimes(2);
      expect(store.getState().sessionPendingResolutions[SESSION_ID]).toEqual([]);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('resolveAgentThreads closes mixed outcomes with each thread explanation', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: {
              kind: 'resolved',
              commitSha: 'abcdef1234567890',
              reply: 'fixed with the shared guard',
            },
            PRRT_2: {
              kind: 'wontfix',
              reason: 'the suggested branch is unreachable',
              reply: 'This path cannot be reached for review threads.',
            },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(gitPushSpy).toHaveBeenCalledTimes(1);
      expect(resolveThreadSpy).toHaveBeenCalledTimes(2);
      const replyCalls = addReplySpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>;
      const bodyByThread = new Map(
        replyCalls.map((call) => [String(call[1]), String(call[2])] as const),
      );
      expect(bodyByThread.get('PRRT_1')).toContain('fixed with the shared guard');
      expect(bodyByThread.get('PRRT_1')).toContain('abcdef1');
      expect(bodyByThread.get('PRRT_2')).toContain(
        'This path cannot be reached for review threads.',
      );
      expect(bodyByThread.get('PRRT_2')).toContain(
        '**Resolution.** Closed without a change: the suggested branch is unreachable',
      );
      expect(bodyByThread.get('PRRT_2')).not.toContain('abcdef1');
    });

    it('resolveAgentThreads includes an owned thread without an in-memory outcome', async () => {
      const store = await getStore();
      const persisted = {
        id: 'pending-3',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_3',
        commitSha: 'abcdef1234567890',
        reply: 'The third thread was already analyzed before restart.',
        outcome: 'analyzed',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'wontfix', reason: 'the behavior is intentional' },
          },
        },
        sessionPendingResolutions: { [SESSION_ID]: [persisted] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([persisted])
        .mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(resolveThreadSpy).toHaveBeenCalledTimes(3);
      expect(deletePendingResolutionSpy).toHaveBeenCalledTimes(3);
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        persisted.threadId,
        `${persisted.reply}\n\n*Written by Goodboy*`,
        expect.anything(),
      );
    });

    it('resolveAgentThreads restores a queued closure after store recreation', async () => {
      const store = await getStore();
      const persisted = {
        id: 'pending-1',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'Persisted reply from the completed resolver.',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'resolver after restart',
              status: 'completed',
              sourceThreadId: persisted.threadId,
            },
          ],
        },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: {},
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([persisted])
        .mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(gitPushSpy).toHaveBeenCalledOnce();
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        persisted.threadId,
        expect.stringContaining(persisted.reply),
        expect.anything(),
      );
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        persisted.threadId,
        expect.stringContaining('**Resolution.** Fixed in `abcdef1`.'),
        expect.anything(),
      );
      expect(resolveThreadSpy).toHaveBeenCalledOnce();
    });

    it('resolveGithubThread records the thread as resolved without waiting for github to echo it', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionResolvedThreads: {},
        sessionResolveThreads: {},
        sessionResolveAttempts: {},
        resolverState: {},
        resolverThreadOutcomes: {},
        sessionPendingResolutions: {},
      });

      const ok = await store
        .getState()
        .resolveGithubThread(SESSION_ID, 'PRT_1', { reason: 'not applicable' });

      expect(ok).toBe(true);
      expect(store.getState().sessionResolvedThreads[SESSION_ID]).toEqual(['PRT_1']);
    });

    it('resolveAgentThreads reports a resolver that owns no thread instead of failing quietly', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'threadless resolver',
              status: 'completed',
            },
          ],
        },
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(false);
      expect(resolveThreadSpy).not.toHaveBeenCalled();
      expect(store.getState().notifications[0]?.title).toBe('nothing to resolve');
    });

    it('resolveAgentThreads skips the branch push when no outcome is resolved', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'explanation resolver',
              status: 'completed',
              sourceThreadId: 'PRRT_1',
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: {
              kind: 'wontfix',
              reason: 'the requested behavior is intentional',
            },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(gitPushSpy).not.toHaveBeenCalled();
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        'PRRT_1',
        `**Not applying.**\n\n**Resolution.** Closed without a change: the requested behavior is intentional\n\n*Written by Goodboy*`,
        expect.anything(),
      );
      expect(resolveThreadSpy).toHaveBeenCalledOnce();
    });

    it('resolveAgentThreads leaves a thread without an outcome open and closes the settled ones', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'mixed resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'wontfix', reason: 'the behavior is intentional' },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      const closedThreadIds = (resolveThreadSpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>)
        .map((call) => String(call[1]))
        .sort();
      expect(closedThreadIds).toEqual(['PRRT_1', 'PRRT_2']);
      expect(store.getState().notifications[0]?.title).toBe('1 thread left open');
    });

    it('resolveAgentThreads never posts a second reply on a thread already closed', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'resolved', commitSha: 'abcdef1234567890' },
          },
        },
        sessionResolvedThreads: { [SESSION_ID]: ['PRRT_1'] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(addReplySpy).toHaveBeenCalledOnce();
      expect(resolveThreadSpy).toHaveBeenCalledOnce();
      const closedFirst = (resolveThreadSpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>)[0];
      expect(String(closedFirst?.[1])).toBe('PRRT_2');
      expect(store.getState().notifications).toEqual([]);
    });

    it('resolveAgentThreads leaves a thread github already closed out of the push', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'wontfix', reason: 'the behavior is intentional' },
          },
        },
        sessionGithub: {
          [SESSION_ID]: {
            pr: null,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: {
              prNumber: 1,
              comments: [
                {
                  id: 'c1',
                  author: 'reviewer',
                  authorAvatarUrl: null,
                  body: 'already handled',
                  createdAt: NOW,
                  url: 'https://github.com/x/y/pull/1#discussion_r1',
                  source: 'review',
                  threadId: 'PRRT_2',
                  resolved: true,
                },
              ],
              reviews: [],
              reviewRequests: [],
              checks: [],
            },
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(true);
      expect(resolveThreadSpy).toHaveBeenCalledOnce();
      const closedOnly = (resolveThreadSpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>)[0];
      expect(String(closedOnly?.[1])).toBe('PRRT_1');
      expect(store.getState().notifications).toEqual([]);
    });

    it('resolveAgentThreads never closes a thread without a reply to post', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'mixed resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'wontfix', reason: 'the behavior is intentional' },
            PRRT_3: { kind: 'analyzed', reply: 'the guard already covers it' },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      const replies = new Map(
        (addReplySpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>).map(
          (call) => [String(call[1]), String(call[2])] as const,
        ),
      );
      expect(resolveThreadSpy).toHaveBeenCalledTimes(3);
      expect(replies.size).toBe(3);
      for (const threadId of ['PRRT_1', 'PRRT_2', 'PRRT_3']) {
        expect(replies.get(threadId)?.trim()).not.toBe('');
      }
    });

    it('resolveAgentThreads pushes nothing and closes nothing when no thread carries a resolution', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'silent resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {},
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(false);
      expect(gitPushSpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).not.toHaveBeenCalled();
      expect(store.getState().notifications[0]?.title).toBe('nothing to resolve');
    });

    it('resolveAgentThreads posts the reply of each thread only on that thread', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890', reply: 'answer for one' },
            PRRT_2: { kind: 'resolved', commitSha: 'abcdef1234567890', reply: 'answer for two' },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([]);

      await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      const replyCalls = addReplySpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>;
      const bodyByThread = new Map(
        replyCalls.map((call) => [String(call[1]), String(call[2])] as const),
      );
      expect(bodyByThread.get('PRRT_1')).toContain('answer for one');
      expect(bodyByThread.get('PRRT_1')).not.toContain('answer for two');
      expect(bodyByThread.get('PRRT_2')).toContain('answer for two');
      expect(bodyByThread.get('PRRT_2')).not.toContain('answer for one');
    });

    it('resolveAgentThreads prefers the caller closure over persisted and global replies', async () => {
      const store = await getStore();
      const persisted = {
        id: 'pending-1',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'persisted reply',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'resolver',
              status: 'completed',
              sourceThreadId: persisted.threadId,
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID_2]: {
            PRRT_1: {
              kind: 'resolved',
              commitSha: persisted.commitSha,
              reply: 'reply from another agent',
            },
          },
          [AGENT_ID]: {
            PRRT_1: {
              kind: 'resolved',
              commitSha: persisted.commitSha,
              reply: 'reply from the caller closure',
            },
          },
        },
        sessionPendingResolutions: { [SESSION_ID]: [persisted] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([persisted])
        .mockResolvedValueOnce([]);

      await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      const replyCalls = addReplySpy.mock.calls as ReadonlyArray<ReadonlyArray<unknown>>;
      const body = String(replyCalls[0]?.[2]);
      expect(body).toContain('reply from the caller closure');
      expect(body).not.toContain('persisted reply');
      expect(body).not.toContain('reply from another agent');
    });

    it('pushAllResolutions posts a queued reply after in-memory outcomes are lost', async () => {
      const store = await getStore();
      const persisted = {
        id: 'pending-1',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'persisted resolver reply',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: {
              kind: 'resolved',
              commitSha: persisted.commitSha,
              reply: persisted.reply,
            },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([persisted]);

      await store.getState().queueResolution(SESSION_ID, {
        threadId: persisted.threadId,
        commitSha: persisted.commitSha,
        prNumber: persisted.prNumber,
      });

      expect(queuePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        id: expect.any(String),
        sessionId: SESSION_ID,
        prNumber: persisted.prNumber,
        threadId: persisted.threadId,
        commitSha: persisted.commitSha,
        reply: persisted.reply,
        outcome: persisted.outcome,
      });

      store.setState({
        resolverThreadOutcomes: {},
        sessionPendingResolutions: {},
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([persisted])
        .mockResolvedValueOnce([persisted])
        .mockResolvedValueOnce([]);

      await store.getState().loadPendingResolutions(SESSION_ID);
      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: true, resolved: 1, failed: 0 });
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        persisted.threadId,
        expect.stringContaining(persisted.reply),
        expect.anything(),
      );
      expect(store.getState().sessionPendingResolutions[SESSION_ID]).toEqual([]);
    });

    it('pushAllResolutions replies without closing a row that carries no verdict', async () => {
      const store = await getStore();
      const legacy = {
        id: 'pending-legacy',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'legacy resolver reply',
        outcome: null,
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [legacy] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([legacy]).mockResolvedValueOnce([]);

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(resolveThreadSpy).not.toHaveBeenCalled();
      expect(gitPushSpy).not.toHaveBeenCalled();
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        legacy.threadId,
        expect.stringContaining(legacy.reply),
        expect.anything(),
      );
      expect(result).toEqual({ pushed: false, resolved: 0, failed: 0 });
    });

    it('pushAllResolutions resolves a row that survived a restart on a persisted verdict alone', async () => {
      const store = await getStore();
      const survivor = {
        id: 'pending-survivor',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: NOW,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [survivor] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([survivor])
        .mockResolvedValueOnce([]);

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(resolveThreadSpy).toHaveBeenCalledOnce();
      expect(addReplySpy).not.toHaveBeenCalled();
      expect(deletePendingResolutionSpy).toHaveBeenCalledOnce();
      expect(result).toEqual({ pushed: true, resolved: 1, failed: 0 });
    });

    it('pushAllResolutions reports the amended sha stored on the queued row', async () => {
      const store = await getStore();
      const amended = {
        id: 'pending-amended',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'bbbbbbbbbbbbbbbb',
        reply: 'adjusted fix',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [amended] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([amended])
        .mockResolvedValueOnce([]);

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: true, resolved: 1, failed: 0 });
      expect(addReplySpy).toHaveBeenCalledWith(
        expect.anything(),
        amended.threadId,
        expect.stringContaining('bbbbbbb'),
        expect.anything(),
      );
    });

    it('pushAllResolutions posts nothing at all when the required push is rejected', async () => {
      const store = await getStore();
      const fix = {
        id: 'pending-fix',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      const wontfix = {
        id: 'pending-wontfix',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_2',
        commitSha: 'abcdef1234567890',
        reply: 'the behavior is intentional',
        outcome: 'wontfix',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [fix, wontfix] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([fix, wontfix])
        .mockResolvedValueOnce([fix]);
      gitPushSpy.mockResolvedValueOnce({
        stdout: '',
        stderr: 'rejected: non-fast-forward',
        exitCode: 1,
      });

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: false, resolved: 0, failed: 2 });
      expect(addReplySpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).not.toHaveBeenCalled();
      expect(
        store
          .getState()
          .sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === fix.threadId),
      ).toMatchObject({
        state: 'fixed',
        stateReason: expect.stringContaining('non-fast-forward'),
      });
      expect(
        store
          .getState()
          .sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === wontfix.threadId),
      ).toMatchObject({
        state: 'answered',
        stateReason: expect.stringContaining('non-fast-forward'),
      });
    });

    it('pushAllResolutions does not repost a reply already recorded as posted', async () => {
      const store = await getStore();
      const fix = {
        id: 'pending-fix',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: NOW,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [fix] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([fix]).mockResolvedValueOnce([]);

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: true, resolved: 1, failed: 0 });
      expect(addReplySpy).not.toHaveBeenCalled();
      expect(resolveThreadSpy).toHaveBeenCalledOnce();
      expect(deletePendingResolutionSpy).toHaveBeenCalledOnce();
    });

    it('pushAllResolutions records the reply before resolving, so a failed resolve keeps the dedup flag', async () => {
      const store = await getStore();
      const fix = {
        id: 'pending-fix',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [fix] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValueOnce([fix]).mockResolvedValueOnce([fix]);
      resolveThreadSpy.mockRejectedValueOnce(new Error('github timed out'));

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: true, resolved: 0, failed: 1 });
      expect(addReplySpy).toHaveBeenCalledOnce();
      expect(markPendingResolutionReplyPostedSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        sessionId: SESSION_ID,
        threadId: fix.threadId,
      });
      expect(deletePendingResolutionSpy).not.toHaveBeenCalled();
      expect(
        store
          .getState()
          .sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === fix.threadId),
      ).toMatchObject({
        state: 'fixed',
        stateReason: expect.stringContaining('github timed out'),
        replyPostedAt: expect.any(Number),
      });
    });

    it('pushAllResolutions only counts a comment as posted when a reply body actually went out', async () => {
      const store = await getStore();
      const empty = {
        id: 'pending-empty',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: '',
        reply: null,
        outcome: null,
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [empty] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([empty])
        .mockResolvedValueOnce([empty]);

      await store.getState().pushAllResolutions(SESSION_ID);

      expect(addReplySpy).not.toHaveBeenCalled();
      expect(store.getState().notifications.some((n) => n.title.includes('left open'))).toBe(false);
    });

    it('pushAllResolutions never reposts a null-outcome row whose reply already went out', async () => {
      const store = await getStore();
      const orphaned = {
        id: 'pending-orphaned',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRT_1',
        commitSha: '',
        reply: null,
        outcome: null,
        replyPostedAt: NOW,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [orphaned] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([orphaned])
        .mockResolvedValueOnce([]);

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(addReplySpy).not.toHaveBeenCalled();
      expect(deletePendingResolutionSpy).toHaveBeenCalledOnce();
      expect(result).toEqual({ pushed: false, resolved: 0, failed: 0 });
    });

    it('pushAllResolutions surfaces the initial queue read failure instead of rejecting', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        resolverThreadOutcomes: {},
        sessionPendingResolutions: {},
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockRejectedValueOnce(new Error('database is locked'));

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: false, resolved: 0, failed: 0 });
      expect(gitPushSpy).not.toHaveBeenCalled();
      const notification = store.getState().notifications[0];
      expect(notification?.title).toBe("couldn't read the comment queue, nothing pushed");
      expect(notification?.body).toBe('database is locked');
      expect(notification?.action).toEqual({
        kind: 'retry-push-resolutions',
        sessionId: SESSION_ID,
      });
    });

    it('pushAllResolutions surfaces the post-push queue refresh failure instead of rejecting', async () => {
      const store = await getStore();
      const fix = {
        id: 'pending-fix',
        sessionId: SESSION_ID,
        prNumber: 1,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      } satisfies PendingResolution;
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        notifications: [],
        resolverThreadOutcomes: {},
        sessionPendingResolutions: { [SESSION_ID]: [fix] },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([fix])
        .mockRejectedValueOnce(new Error('database is locked'));

      const result = await store.getState().pushAllResolutions(SESSION_ID);

      expect(result).toEqual({ pushed: true, resolved: 1, failed: 0 });
      expect(deletePendingResolutionSpy).toHaveBeenCalledOnce();
      const notification = store.getState().notifications[0];
      expect(notification?.title).toBe('queue refresh failed after push');
      expect(notification?.body).toBe(
        'database is locked. some comments may still show as pending until you retry.',
      );
      expect(notification?.body?.split('. ')).toHaveLength(2);
      expect(notification?.sessionId).toBe(SESSION_ID);
      expect(notification?.workspaceId).toBe(WS_ID);
      expect(notification?.action).toEqual({
        kind: 'retry-push-resolutions',
        sessionId: SESSION_ID,
      });
    });

    it('resolveAgentThreads surfaces the queue read failure instead of rejecting', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        notifications: [],
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
          },
        },
      });
      listPendingResolutionsForSessionSpy.mockRejectedValueOnce(new Error('database is locked'));

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(false);
      expect(gitPushSpy).not.toHaveBeenCalled();
      const notification = store.getState().notifications[0];
      expect(notification?.title).toBe("couldn't read the comment queue, threads left open");
      expect(notification?.body).toBe('database is locked');
      expect(notification?.action).toEqual({
        kind: 'retry-push-resolutions',
        sessionId: SESSION_ID,
      });
    });

    it('resolveAgentThreads keeps closing after one thread throws and still refreshes', async () => {
      const store = await getStore();
      const refresh = vi.fn(async () => undefined);
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        notifications: [],
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1', 'PRRT_2'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
            PRRT_2: { kind: 'resolved', commitSha: 'abcdef1234567890' },
          },
        },
        sessionPendingResolutions: {},
        refreshSessionPrDetail: refresh,
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);
      resolveThreadSpy.mockRejectedValueOnce(new Error('gh api exploded'));

      const didResolve = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(didResolve).toBe(false);
      expect(resolveThreadSpy).toHaveBeenCalledTimes(2);
      expect(refresh).toHaveBeenCalledOnce();
      await vi.waitFor(() =>
        expect(store.getState().notifications.map((entry) => entry.title)).toContain(
          '1 thread failed to close',
        ),
      );
    });

    it('resolveAgentThreads persists first for a target with no backing row, so a retry does not repost', async () => {
      const store = await getStore();
      const openPr = {
        number: 9,
        title: 't',
        state: 'open',
        updatedAt: '2026-05-28T00:00:00.000Z',
      } as PullRequestState;
      const baseState = {
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionGithub: {
          [SESSION_ID]: {
            pr: openPr,
            linkedIssues: [],
            fetchedAt: null,
            failedAt: null,
            loading: false,
            error: null,
            detail: null,
            detailFetchedAt: null,
            detailLoading: false,
            detailError: null,
          },
        },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'combined resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1'],
            } as Agent,
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: {
            PRRT_1: { kind: 'resolved' as const, commitSha: 'abcdef1234567890', reply: 'fixed it' },
          },
        },
        refreshSessionPrDetail: vi.fn(async () => undefined),
      };
      store.setState({ ...baseState, sessionPendingResolutions: {} });

      const survivingRow = {
        id: 'pending-survivor',
        sessionId: SESSION_ID,
        prNumber: 9,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
        replyPostedAt: NOW,
        createdAt: NOW,
      } satisfies PendingResolution;

      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([survivingRow]);
      resolveThreadSpy.mockRejectedValueOnce(new Error('github timed out'));

      const firstAttempt = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(firstAttempt).toBe(false);
      expect(queuePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        id: expect.any(String),
        sessionId: SESSION_ID,
        prNumber: 9,
        threadId: 'PRRT_1',
        commitSha: 'abcdef1234567890',
        reply: 'fixed it',
        outcome: 'resolved',
      });
      expect(addReplySpy).toHaveBeenCalledOnce();
      expect(deletePendingResolutionSpy).not.toHaveBeenCalled();

      store.setState({ ...baseState, sessionPendingResolutions: { [SESSION_ID]: [survivingRow] } });
      listPendingResolutionsForSessionSpy
        .mockResolvedValueOnce([survivingRow])
        .mockResolvedValueOnce([]);

      const secondAttempt = await store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID);

      expect(secondAttempt).toBe(true);
      expect(addReplySpy).toHaveBeenCalledOnce();
      expect(resolveThreadSpy).toHaveBeenCalledTimes(2);
      expect(deletePendingResolutionSpy).toHaveBeenCalledWith({
        db: expect.anything(),
        sessionId: SESSION_ID,
        threadId: 'PRRT_1',
      });
    });

    it('resolveAgentThreads skips a second run racing the same session', async () => {
      const store = await getStore();
      store.setState({
        workspaces: [buildWorkspace()],
        sessions: [buildSession()],
        sessionBranches: { [SESSION_ID]: 'ak/feat-x' },
        sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.wt/x'] },
        sessionPhaseRuns: {
          [SESSION_ID]: [
            {
              id: AGENT_ID,
              sessionId: SESSION_ID,
              ordinal: 0,
              name: 'single resolver',
              status: 'completed',
              sourceThreadIds: ['PRRT_1'],
            },
          ],
        },
        resolverThreadOutcomes: {
          [AGENT_ID]: { PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' } },
        },
        sessionPendingResolutions: {},
        refreshSessionPrDetail: vi.fn(async () => undefined),
      });
      listPendingResolutionsForSessionSpy.mockResolvedValue([]);

      const [first, second] = await Promise.all([
        store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID),
        store.getState().resolveAgentThreads(SESSION_ID, AGENT_ID),
      ]);

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(gitPushSpy).toHaveBeenCalledTimes(1);
      expect(resolveThreadSpy).toHaveBeenCalledTimes(1);
    });
  });
});
