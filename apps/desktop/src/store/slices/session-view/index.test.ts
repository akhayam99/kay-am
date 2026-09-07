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
  SessionExternalTask,
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
import { STORAGE_PREFIXES } from '../../../shared/lib/storage-keys';
import { readPersistedLens } from './workSurfaceStorage';
import { LENS_KINDS } from './types';
import { LENS_LABEL } from '../../../features/session/lens-labels';
import { resolveOpenDiffViewerEvent } from './openDiffViewerEvent';

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

function buildExternalTask(overrides: Partial<SessionExternalTask> = {}): SessionExternalTask {
  return {
    sessionId: SESSION_ID,
    provider: 'linear',
    externalId: 'ENG-42',
    identifier: 'ENG-42',
    url: 'https://linear.app/acme/issue/ENG-42',
    title: 'Track linked work',
    createdAt: NOW,
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
        activeLens: {},
        lensHistory: {},
        workflowExpand: {},
        focusedPlanId: {},
        focusedExternalTask: {},
        sessionStudio: {},
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

  describe('session-view', () => {
    it('getSessionViewPrefs returns defaults for a workspace with no stored prefs', async () => {
      const store = await getStore();
      const prefs = store.getState().getSessionViewPrefs(WS_ID);
      expect(prefs).toEqual({ sort: 'updatedAt', group: 'stage' });
    });

    it('setSessionSort persists the chosen sort key', async () => {
      const store = await getStore();
      store.getState().setSessionSort(WS_ID, 'goal');
      expect(store.getState().sessionViewPrefs[WS_ID]?.sort).toBe('goal');
    });

    it('setSessionGroup persists the chosen group key', async () => {
      const store = await getStore();
      store.getState().setSessionGroup(WS_ID, 'pr');
      expect(store.getState().sessionViewPrefs[WS_ID]?.group).toBe('pr');
    });

    it('setActiveLens persists and readPersistedLens restores it', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      expect(readPersistedLens(SESSION_ID)).toBe('agents');
    });

    it('setActiveLens(null) clears the persisted lens (Overview empty-state)', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().setActiveLens(SESSION_ID, null);
      expect(store.getState().activeLens[SESSION_ID]).toBeNull();
      expect(readPersistedLens(SESSION_ID)).toBeNull();
    });

    it('migrates a legacy "dashboard" persisted value to null (Overview)', async () => {
      globalThis.localStorage.setItem(
        `${STORAGE_PREFIXES.workSurfaceView}${SESSION_ID}`,
        'dashboard',
      );
      expect(readPersistedLens(SESSION_ID)).toBeNull();
    });

    it('migrates a legacy resolve lens to the review board', async () => {
      globalThis.localStorage.setItem(
        `${STORAGE_PREFIXES.workSurfaceView}${SESSION_ID}`,
        'resolve',
      );
      expect(readPersistedLens(SESSION_ID)).toBe('review');
    });

    it('restores the shared Context surface', async () => {
      globalThis.localStorage.setItem(
        `${STORAGE_PREFIXES.workSurfaceView}${SESSION_ID}`,
        'context',
      );
      expect(readPersistedLens(SESSION_ID)).toBe('context');
    });

    it('degrades an unknown persisted lens to Overview', async () => {
      globalThis.localStorage.setItem(
        `${STORAGE_PREFIXES.workSurfaceView}${SESSION_ID}`,
        'removed-integration',
      );
      expect(readPersistedLens(SESSION_ID)).toBeNull();
    });

    it('restores a persisted integration lens', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'linear');
      expect(readPersistedLens(SESSION_ID)).toBe('linear');
    });

    it('LENS_KINDS holds every lens kind the union declares', () => {
      expect([...LENS_KINDS].sort()).toEqual(Object.keys(LENS_LABEL).sort());
    });

    it.each([...LENS_KINDS])('every lens kind survives a restart: %s', async (lens) => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, lens);
      expect(readPersistedLens(SESSION_ID)).toBe(lens);
    });

    it('lensGo walks back and forward through visited lenses', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().setActiveLens(SESSION_ID, 'plans');
      store.getState().lensGo(SESSION_ID, -1);
      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      store.getState().lensGo(SESSION_ID, 1);
      expect(store.getState().activeLens[SESSION_ID]).toBe('plans');
    });

    it('lensGo clamps at history bounds', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().lensGo(SESSION_ID, -5);
      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      store.getState().lensGo(SESSION_ID, 5);
      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
    });

    it('lensGo restores the agent chat the user was on, not just its lens', async () => {
      const store = await getStore();
      store.setState({
        sessionPhaseRuns: { [SESSION_ID]: [buildAgent({ id: AGENT_ID })] },
      } as never);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.setState({ selectedAgentId: { [SESSION_ID]: AGENT_ID } } as never);
      store.getState().setActiveLens(SESSION_ID, 'plans');

      store.getState().lensGo(SESSION_ID, -1);

      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      expect(store.getState().selectedAgentId[SESSION_ID]).toBe(AGENT_ID);
    });

    it('lensGo drops an agent that no longer exists and still restores its lens', async () => {
      const store = await getStore();
      store.setState({
        sessionPhaseRuns: { [SESSION_ID]: [buildAgent({ id: AGENT_ID })] },
      } as never);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.setState({ selectedAgentId: { [SESSION_ID]: AGENT_ID } } as never);
      store.getState().setActiveLens(SESSION_ID, 'plans');
      store.setState({ sessionPhaseRuns: { [SESSION_ID]: [] } } as never);

      store.getState().lensGo(SESSION_ID, -1);

      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      expect(store.getState().selectedAgentId[SESSION_ID]).toBeNull();
    });

    it('lensGo does not push a new entry, so back and forward stay symmetric', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().setActiveLens(SESSION_ID, 'plans');
      const before = store.getState().lensHistory[SESSION_ID]?.entries.length;

      store.getState().lensGo(SESSION_ID, -1);
      store.getState().lensGo(SESSION_ID, -1);

      expect(store.getState().lensHistory[SESSION_ID]?.entries.length).toBe(before);
      expect(store.getState().lensHistory[SESSION_ID]?.index).toBe(0);
      store.getState().lensGo(SESSION_ID, 1);
      expect(store.getState().activeLens[SESSION_ID]).toBe('plans');
    });

    it('selecting a new lens after going back truncates the forward history', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().setActiveLens(SESSION_ID, 'plans');
      store.getState().lensGo(SESSION_ID, -1);
      store.getState().setActiveLens(SESSION_ID, 'files');
      store.getState().lensGo(SESSION_ID, 1);
      expect(store.getState().activeLens[SESSION_ID]).toBe('files');
    });

    it('toggleWorkflowExpand flips around the supplied default and persists per run', async () => {
      const store = await getStore();
      store.getState().toggleWorkflowExpand(SESSION_ID, 'run-a', true);
      expect(store.getState().workflowExpand[SESSION_ID]?.['run-a']).toBe(false);
      store.getState().toggleWorkflowExpand(SESSION_ID, 'run-a', true);
      expect(store.getState().workflowExpand[SESSION_ID]?.['run-a']).toBe(true);
      store.getState().toggleWorkflowExpand(SESSION_ID, 'run-b', false);
      expect(store.getState().workflowExpand[SESSION_ID]?.['run-b']).toBe(true);
      expect(store.getState().workflowExpand[SESSION_ID]?.['run-a']).toBe(true);
    });

    it('setFocusedPlanId and setSessionStudio update per-session state', async () => {
      const store = await getStore();
      store.getState().setFocusedPlanId(SESSION_ID, PLAN_ID);
      store.getState().setSessionStudio(SESSION_ID, { kind: 'workflow' });
      expect(store.getState().focusedPlanId[SESSION_ID]).toBe(PLAN_ID);
      expect(store.getState().sessionStudio[SESSION_ID]).toEqual({ kind: 'workflow' });
    });

    it('setActiveLens clears the selected agent (foreground reconciliation)', async () => {
      const store = await getStore();
      store.setState({ selectedAgentId: { [SESSION_ID]: AGENT_ID } } as never);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().selectedAgentId[SESSION_ID]).toBeNull();
    });

    it('setActiveLens clears any open session studio', async () => {
      const store = await getStore();
      store.getState().setSessionStudio(SESSION_ID, { kind: 'workflow' });
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().sessionStudio[SESSION_ID]).toBeNull();
    });

    it('setDiffFocus survives the switch to the files lens and dies on any other', async () => {
      const store = await getStore();
      store
        .getState()
        .setDiffFocus(SESSION_ID, { kind: 'commit', sha: 'abc1234', path: 'src/a.ts' });
      store.getState().setActiveLens(SESSION_ID, 'files');
      expect(store.getState().diffFocus[SESSION_ID]).toEqual({
        kind: 'commit',
        sha: 'abc1234',
        path: 'src/a.ts',
      });
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().diffFocus[SESSION_ID]).toBeNull();
    });

    it('focusedPlanId survives the switch to the plans lens and dies on any other', async () => {
      const store = await getStore();
      store.getState().setFocusedPlanId(SESSION_ID, PLAN_ID);
      store.getState().setActiveLens(SESSION_ID, 'plans');
      expect(store.getState().focusedPlanId[SESSION_ID]).toBe(PLAN_ID);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().focusedPlanId[SESSION_ID]).toBeNull();
    });

    it('focusedGithubIssueNumber survives the switch to the github_issue lens and dies on any other', async () => {
      const store = await getStore();
      store.getState().setFocusedGithubIssueNumber(SESSION_ID, 9);
      store.getState().setActiveLens(SESSION_ID, 'github_issue');
      expect(store.getState().focusedGithubIssueNumber[SESSION_ID]).toBe(9);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      expect(store.getState().focusedGithubIssueNumber[SESSION_ID]).toBeNull();
    });

    it('openDiffLens lands on the files lens with the commit focus still set', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().openDiffLens(SESSION_ID, { kind: 'commit', sha: 'abc1234', path: null });
      expect(store.getState().activeLens[SESSION_ID]).toBe('files');
      expect(store.getState().diffFocus[SESSION_ID]).toEqual({
        kind: 'commit',
        sha: 'abc1234',
        path: null,
      });
    });

    it('openDiffLens carries a working-tree focus and leaves a step to go back to', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'review');
      store.getState().openDiffLens(SESSION_ID, { kind: 'working', path: null });
      expect(store.getState().diffFocus[SESSION_ID]).toEqual({ kind: 'working', path: null });
      store.getState().lensGo(SESSION_ID, -1);
      expect(store.getState().activeLens[SESSION_ID]).toBe('review');
    });

    it.each([
      ['linear', 'linear'],
      ['gitlab', 'gitlab_issues'],
      ['jira', 'jira_issues'],
    ] as const)(
      'openExternalTaskLens lands on the %s lens with the clicked issue focused',
      async (provider, lens) => {
        const store = await getStore();
        store
          .getState()
          .openExternalTaskLens(
            SESSION_ID,
            buildExternalTask({ provider, externalId: `${provider}-7` }),
          );
        expect(store.getState().activeLens[SESSION_ID]).toBe(lens);
        expect(store.getState().focusedExternalTask[SESSION_ID]).toEqual({
          provider,
          externalId: `${provider}-7`,
          projectId: null,
        });
      },
    );

    it.each(['linear', 'gitlab_issues', 'jira_issues'] as const)(
      'opening the %s lens on its own focuses no issue',
      async (lens) => {
        const store = await getStore();
        store.getState().setActiveLens(SESSION_ID, lens);
        expect(store.getState().focusedExternalTask[SESSION_ID]).toBeNull();
      },
    );

    it.each([
      ['linear', 'linear'],
      ['gitlab', 'gitlab_issues'],
      ['jira', 'jira_issues'],
    ] as const)(
      'reopening the %s lens from the rail drops the issue a linked row had focused',
      async (provider, lens) => {
        const store = await getStore();
        store.getState().openExternalTaskLens(SESSION_ID, buildExternalTask({ provider }));
        store.getState().setActiveLens(SESSION_ID, 'agents');
        expect(store.getState().focusedExternalTask[SESSION_ID]).toBeNull();
        store.getState().setActiveLens(SESSION_ID, lens);
        expect(store.getState().focusedExternalTask[SESSION_ID]).toBeNull();
      },
    );

    it('openExternalTaskLens sends a sentry issue to the inbox scoped to its session', async () => {
      const store = await getStore();
      store.setState({ sessions: [buildSession()] } as never);
      store.getState().setActiveLens(SESSION_ID, 'agents');
      const detail = vi.fn();
      const listener = (event: Event) => {
        detail(event instanceof CustomEvent ? event.detail : null);
      };
      window.addEventListener('goodboy:open-inbox', listener);

      store
        .getState()
        .openExternalTaskLens(
          SESSION_ID,
          buildExternalTask({ provider: 'sentry', externalId: '12345' }),
        );

      window.removeEventListener('goodboy:open-inbox', listener);
      expect(detail).toHaveBeenCalledWith({
        workspaceId: WS_ID,
        provider: 'sentry',
        recordKey: 'sentry:error:12345',
        sessionId: SESSION_ID,
      });
      expect(store.getState().activeLens[SESSION_ID]).toBe('agents');
      expect(store.getState().focusedExternalTask[SESSION_ID]).toBeNull();
    });

    it('openExternalTaskLens sends a github task to the issue lens by its number', async () => {
      const store = await getStore();
      store
        .getState()
        .openExternalTaskLens(
          SESSION_ID,
          buildExternalTask({ provider: 'github', externalId: '9', identifier: '#9' }),
        );
      expect(store.getState().activeLens[SESSION_ID]).toBe('github_issue');
      expect(store.getState().focusedGithubIssueNumber[SESSION_ID]).toBe(9);
      expect(store.getState().focusedExternalTask[SESSION_ID]).toBeNull();
    });

    it('the open-diff-viewer event resolution cannot land on a stale commit after going back', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'review');
      store.getState().openDiffLens(SESSION_ID, { kind: 'commit', sha: 'abc1234', path: null });
      store.getState().lensGo(SESSION_ID, -1);
      expect(store.getState().diffFocus[SESSION_ID]).toEqual({
        kind: 'commit',
        sha: 'abc1234',
        path: null,
      });

      const resolved = resolveOpenDiffViewerEvent({ detail: { sessionId: SESSION_ID } });
      if (resolved === null) {
        throw new Error('expected a resolution');
      }
      store.getState().openDiffLens(resolved.sessionId, resolved.focus);

      expect(store.getState().activeLens[SESSION_ID]).toBe('files');
      expect(store.getState().diffFocus[SESSION_ID]).toBeNull();
    });

    it('the event path and a direct openDiffLens call land in identical state', async () => {
      const store = await getStore();
      store.getState().openDiffLens(SESSION_ID, { kind: 'commit', sha: 'abc1234', path: null });
      const resolved = resolveOpenDiffViewerEvent({ detail: { sessionId: SESSION_ID } });
      if (resolved === null) {
        throw new Error('expected a resolution');
      }
      store.getState().openDiffLens(resolved.sessionId, resolved.focus);
      const eventPathState = {
        activeLens: store.getState().activeLens[SESSION_ID],
        diffFocus: store.getState().diffFocus[SESSION_ID],
      };

      store.getState().openDiffLens(SESSION_ID_2, { kind: 'commit', sha: 'abc1234', path: null });
      store.getState().openDiffLens(SESSION_ID_2, null);
      const directCallState = {
        activeLens: store.getState().activeLens[SESSION_ID_2],
        diffFocus: store.getState().diffFocus[SESSION_ID_2],
      };

      expect(eventPathState).toEqual(directCallState);
    });

    it('openMountDiff selects the mount and leaves the focus null so the lens lands on the branch default', async () => {
      const store = await getStore();
      store.getState().setActiveLens(SESSION_ID, 'agents');
      store.getState().setDiffFocus(SESSION_ID, { kind: 'working', path: null });
      store.getState().openMountDiff(SESSION_ID, '/wt/api');

      expect(store.getState().activeLens[SESSION_ID]).toBe('files');
      expect(store.getState().diffMountPath[SESSION_ID]).toBe('/wt/api');
      expect(store.getState().diffFocus[SESSION_ID]).toBeNull();
    });

    it('openMountDiff clears a commit focus a resolver link left behind', async () => {
      const store = await getStore();
      store.getState().openDiffLens(SESSION_ID, { kind: 'commit', sha: 'abc1234', path: null });
      store.getState().openMountDiff(SESSION_ID, '/wt/web');

      expect(store.getState().diffFocus[SESSION_ID]).toBeNull();
      expect(store.getState().diffMountPath[SESSION_ID]).toBe('/wt/web');
    });

    it('setSessionStudio(non-null) clears the selected agent', async () => {
      const store = await getStore();
      store.setState({ selectedAgentId: { [SESSION_ID]: AGENT_ID } } as never);
      store.getState().setSessionStudio(SESSION_ID, { kind: 'workflow' });
      expect(store.getState().sessionStudio[SESSION_ID]).toEqual({ kind: 'workflow' });
      expect(store.getState().selectedAgentId[SESSION_ID]).toBeNull();
    });

    it('setSessionStudio(null) leaves the selected agent untouched', async () => {
      const store = await getStore();
      store.setState({ selectedAgentId: { [SESSION_ID]: AGENT_ID } } as never);
      store.getState().setSessionStudio(SESSION_ID, null);
      expect(store.getState().selectedAgentId[SESSION_ID]).toBe(AGENT_ID);
    });

    it('selectAgent clears any open session studio (foreground reconciliation)', async () => {
      const store = await getStore();
      store.setState({
        transcripts: { [AGENT_ID]: [] },
        sessionStudio: { [SESSION_ID]: { kind: 'workflow' } },
      } as never);
      await store.getState().selectAgent(SESSION_ID, AGENT_ID);
      expect(store.getState().selectedAgentId[SESSION_ID]).toBe(AGENT_ID);
      expect(store.getState().sessionStudio[SESSION_ID]).toBeNull();
    });
  });
});
