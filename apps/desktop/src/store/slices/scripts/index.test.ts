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
  MountId,
  PlanWithCount,
  Project,
  ProjectId,
  ProviderRunId,
  Session,
  SessionId,
  SessionProjectMount,
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
const invokeScriptRunSpy: ReturnType<typeof vi.fn> = vi.fn(async () => undefined);
const scanProjectScriptsSpy = vi.fn(
  async () =>
    [] as ReadonlyArray<{
      source: 'package-json' | 'composer';
      packageName: string;
      relDir: string;
      manager: string;
      scripts: ReadonlyArray<{ name: string; command: string }>;
    }>,
);
const runAdhocScriptSpy: ReturnType<typeof vi.fn> = vi.fn(async () => 'run-adhoc');
const invokeScriptListLiveSpy = vi.fn<
  () => Promise<
    ReadonlyArray<{
      runId: string;
      scriptId: ProjectScriptId;
      sessionId: SessionId;
      startedAt: number;
    }>
  >
>(async () => []);
let scriptExitHandler: ((payload: { runId: string; exitCode: number }) => void) | null = null;
const listenScriptExitSpy = vi.fn(
  async (handler: (payload: { runId: string; exitCode: number }) => void) => {
    scriptExitHandler = handler;
    return () => undefined;
  },
);

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
  invokeScriptRun: invokeScriptRunSpy,
  scanProjectScripts: scanProjectScriptsSpy,
  runAdhocScript: runAdhocScriptSpy,
  invokeScriptListLive: invokeScriptListLiveSpy,
  invokeScriptCancel: vi.fn(async () => undefined),
  listenScriptOutput: vi.fn(async () => () => undefined),
  listenScriptExit: listenScriptExitSpy,
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
const PROJECT_ID_2 = 'project-2' as ProjectId;
const SESSION_ID = 'session-1' as SessionId;
const SESSION_ID_2 = 'session-2' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const AGENT_ID_2 = 'agent-2' as AgentId;
const RUN_ID = 'run-1' as ProviderRunId;
const PLAN_ID = 'plan-1' as PlanId;
const NOW = '2026-05-28T00:00:00.000Z' as IsoDateTime;

const FIRST_MOUNT_ID = 'mount-api-one' as MountId;
const SECOND_MOUNT_ID = 'mount-api-two' as MountId;

const TWO_API_MOUNTS: ReadonlyArray<SessionProjectMount> = [
  {
    mountId: FIRST_MOUNT_ID,
    projectId: PROJECT_ID,
    mountName: 'api',
    worktreePath: '/sessions/one/api-one',
    repoRoot: '/repos/api',
    branch: 'ak/one',
  },
  {
    mountId: SECOND_MOUNT_ID,
    projectId: PROJECT_ID,
    mountName: 'api split',
    worktreePath: '/sessions/one/api-two',
    repoRoot: '/repos/api',
    branch: 'ak/two',
  },
];

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

const buildProject = (overrides: Partial<Project> = {}): Project => ({
  id: PROJECT_ID,
  workspaceId: WS_ID,
  name: 'repo',
  rootPath: '/tmp/repo',
  kind: 'repo',
  overrides: buildWorkspace().overrides,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
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
    scriptExitHandler = null;
    invokeScriptListLiveSpy.mockResolvedValue([]);
    listIntegrationBindingsForWorkspaceSpy.mockResolvedValue([]);
    listDiffCommentsSpy.mockResolvedValue([]);
    dbGetSettingSpy.mockResolvedValue(null);
    ghStatusSpy.mockResolvedValue({ available: true, mode: 'gh-cli', scopes: [] });

    const store = await getStore();
    if (!resetState) {
      const snap = store.getState();
      resetState = {
        workspaces: [],
        projects: [buildProject(), buildProject({ id: PROJECT_ID_2, name: 'web' })],
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
        sessionProjectMounts: {},
        sessionActiveProject: {},
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
        discoveredScripts: {},
        discoveredScriptScans: {},
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

  describe('scripts', () => {
    it('loads discovered scripts once and refreshes them on demand', async () => {
      const store = await getStore();
      const group = {
        source: 'package-json' as const,
        packageName: 'desktop',
        relDir: '',
        manager: 'pnpm',
        scripts: [{ name: 'dev', command: 'pnpm run dev' }],
      };
      scanProjectScriptsSpy.mockResolvedValue([group]);

      await store
        .getState()
        .loadDiscoveredScripts({ sessionId: SESSION_ID, worktreePath: '/sessions/one/api' });
      await store
        .getState()
        .loadDiscoveredScripts({ sessionId: SESSION_ID, worktreePath: '/sessions/one/api' });
      await store
        .getState()
        .refreshDiscoveredScripts({ sessionId: SESSION_ID, worktreePath: '/sessions/one/api' });

      expect(scanProjectScriptsSpy).toHaveBeenCalledTimes(2);
      expect(store.getState().discoveredScripts[SESSION_ID]?.['/sessions/one/api']).toEqual([
        group,
      ]);
      expect(store.getState().discoveredScriptScans[SESSION_ID]?.['/sessions/one/api']).toEqual({
        status: 'ready',
        error: null,
      });
    });

    it('runs a discovered script through the ad hoc bridge and shared listeners', async () => {
      const store = await getStore();
      const resultPromise = store.getState().runDiscoveredScript({
        sessionId: SESSION_ID,
        scriptId: 'manifest-script',
        name: 'dev',
        command: 'pnpm run dev',
        cwd: '/sessions/one/api/apps/web',
      });
      await vi.waitFor(() => expect(runAdhocScriptSpy).toHaveBeenCalledOnce());
      const invocation = runAdhocScriptSpy.mock.calls[0]?.[0];
      if (invocation?.runId === undefined || scriptExitHandler === null) {
        throw new Error('discovered script listeners were not ready');
      }
      scriptExitHandler({ runId: invocation.runId, exitCode: 0 });
      await resultPromise;

      expect(invocation).toEqual(
        expect.objectContaining({
          scriptId: 'manifest-script',
          name: 'dev',
          body: 'pnpm run dev',
          sessionId: SESSION_ID,
          cwd: '/sessions/one/api/apps/web',
        }),
      );
      expect(store.getState().scriptRuns[SESSION_ID]?.['manifest-script']?.status).toBe('ok');
    });

    it('loadScripts caches workspace scripts', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'test',
        body: 'echo',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      listProjectScriptsSpy.mockResolvedValueOnce([script]);
      await store.getState().loadScripts(WS_ID);
      expect(store.getState().projectScripts[WS_ID]).toEqual([script]);
    });

    it('deleteScript removes from cache immediately', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'test',
        body: 'echo',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({ projectScripts: { [WS_ID]: [script] } });
      await store.getState().deleteScript(script.id, WS_ID);
      expect(store.getState().projectScripts[WS_ID]).toEqual([]);
    });

    it('saveScript persists the required project id for a new script', async () => {
      const store = await getStore();

      await store.getState().saveScript({
        workspaceId: WS_ID,
        projectId: PROJECT_ID_2,
        name: 'web setup',
        body: 'echo web',
      });

      expect(upsertProjectScriptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          script: expect.objectContaining({ projectId: PROJECT_ID_2 }),
        }),
      );
    });

    it('saveScript refuses a project that belongs to another workspace', async () => {
      const store = await getStore();
      store.setState({
        projects: [
          buildProject(),
          buildProject({ id: PROJECT_ID_2, workspaceId: 'ws-other' as WorkspaceId }),
        ],
      } as never);

      await expect(
        store
          .getState()
          .saveScript({ workspaceId: WS_ID, projectId: PROJECT_ID_2, name: 'x', body: 'echo' }),
      ).rejects.toThrow(/does not belong/);
      expect(upsertProjectScriptSpy).not.toHaveBeenCalled();
    });

    it('saveScript reassigns an existing script to the given project', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'setup',
        body: 'echo api',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({ projectScripts: { [WS_ID]: [script] } });

      await store.getState().saveScript({
        workspaceId: WS_ID,
        projectId: PROJECT_ID_2,
        id: script.id,
        name: script.name,
        body: script.body,
      });

      expect(upsertProjectScriptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          script: expect.objectContaining({ id: script.id, projectId: PROJECT_ID_2 }),
        }),
      );
    });

    it("runScript invokes the script in its project's session mount", async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID_2,
        name: 'web setup',
        body: 'echo web',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const mounts: ReadonlyArray<SessionProjectMount> = [
        {
          projectId: PROJECT_ID,
          mountName: 'api',
          worktreePath: '/sessions/one/api',
          repoRoot: '/repos/api',
          branch: 'ak/one',
        },
        {
          projectId: PROJECT_ID_2,
          mountName: 'web',
          worktreePath: '/sessions/one/web',
          repoRoot: '/repos/web',
          branch: 'ak/one',
        },
      ];
      store.setState({
        sessions: [buildSession({ activeProjectId: PROJECT_ID })],
        sessionProjectMounts: { [SESSION_ID]: mounts },
        projectScripts: { [WS_ID]: [script] },
      });

      const resultPromise = store
        .getState()
        .runScript({ sessionId: SESSION_ID, scriptId: script.id });
      await vi.waitFor(() => expect(invokeScriptRunSpy).toHaveBeenCalledOnce());
      const invocation = invokeScriptRunSpy.mock.calls[0]?.[0];
      const runId = invocation?.runId;
      if (runId === undefined || scriptExitHandler === null) {
        throw new Error('script listeners were not ready');
      }
      scriptExitHandler({ runId, exitCode: 0 });
      await resultPromise;

      expect(invocation?.cwd).toBe('/sessions/one/web');
    });

    it('runScript refuses to guess between two mounts of the same project', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'setup',
        body: 'echo api',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({
        sessions: [buildSession({ activeProjectId: PROJECT_ID })],
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: TWO_API_MOUNTS },
        projectScripts: { [WS_ID]: [script] },
      });

      const result = await store
        .getState()
        .runScript({ sessionId: SESSION_ID, scriptId: script.id });

      expect(invokeScriptRunSpy).not.toHaveBeenCalled();
      expect(result.stderr).toContain('several mounts');
    });

    it('runScript uses the mount the caller named', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'setup',
        body: 'echo api',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({
        sessions: [buildSession({ activeProjectId: PROJECT_ID })],
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: TWO_API_MOUNTS },
        projectScripts: { [WS_ID]: [script] },
      });

      const resultPromise = store
        .getState()
        .runScript({ sessionId: SESSION_ID, scriptId: script.id, mountId: SECOND_MOUNT_ID });
      await vi.waitFor(() => expect(invokeScriptRunSpy).toHaveBeenCalledOnce());
      const invocation = invokeScriptRunSpy.mock.calls[0]?.[0];
      const runId = invocation?.runId;
      if (runId === undefined || scriptExitHandler === null) {
        throw new Error('script listeners were not ready');
      }
      scriptExitHandler({ runId, exitCode: 0 });
      await resultPromise;

      expect(invocation?.cwd).toBe('/sessions/one/api-two');
    });

    it('runScript records an error and refuses to invoke when the project is unmounted', async () => {
      const store = await getStore();
      const script: ProjectScript = {
        id: 'sc-1' as ProjectScriptId,
        projectId: PROJECT_ID,
        name: 'setup',
        body: 'echo api',
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.setState({
        sessions: [buildSession()],
        sessionProjectMounts: { [SESSION_ID]: [] },
        projectScripts: { [WS_ID]: [script] },
      });

      const result = await store
        .getState()
        .runScript({ sessionId: SESSION_ID, scriptId: script.id });

      expect(invokeScriptRunSpy).not.toHaveBeenCalled();
      expect(store.getState().scriptRuns[SESSION_ID]?.[script.id]?.status).toBe('error');
      expect(result.stderr).toBe('repo is not mounted in this session');
    });

    it('reattaches a live script run and completes it from the recovered exit listener', async () => {
      const store = await getStore();
      const scriptId = 'sc-live' as ProjectScriptId;
      invokeScriptListLiveSpy.mockResolvedValueOnce([
        { runId: 'run-live', scriptId, sessionId: SESSION_ID, startedAt: 1234 },
      ]);

      await store.getState().reattachScriptRuns();

      expect(store.getState().scriptRuns[SESSION_ID]?.[scriptId]).toEqual({
        status: 'pending',
        result: null,
        runId: 'run-live',
        startedAt: 1234,
      });
      if (scriptExitHandler === null) {
        throw new Error('script exit listener was not restored');
      }
      scriptExitHandler({ runId: 'run-live', exitCode: 0 });
      expect(store.getState().scriptRuns[SESSION_ID]?.[scriptId]?.status).toBe('ok');
    });
  });
});
