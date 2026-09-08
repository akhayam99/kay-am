import { vi } from 'vitest';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  Session,
  SessionId,
  TurnEvent,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';

export const STORY_NOW = '2026-08-22T00:00:00.000Z' as IsoDateTime;

const cleanWorkingTree = {
  workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0 },
} as never;

export const storySpies = {
  runTurn: vi.fn(),
  cancelTurn: vi.fn(async (_runId: unknown) => undefined),
  writeAttachment: vi.fn(async () => '.goodboy/attachments/spec.pdf'),
  tauriInvoke: vi.fn(async (_cmd: unknown, _args?: unknown) => undefined),
  invokeAgentList: vi.fn(async (_sessionId: unknown) => [] as ReadonlyArray<never>),
  invokeBudgetAlertsList: vi.fn(async () => [] as ReadonlyArray<never>),
  createWorktree: vi.fn(async (_args: unknown) => ({
    worktreePath: '/tmp/app/.goodboy/worktrees/goal-12345678',
    branchName: 'goodboy/goal-12345678',
    slug: 'goal-12345678',
    reused: false,
  })),
  createSessionDir: vi.fn(async (_args: unknown) => ({
    worktreePath: '/tmp/app/sessions/goal-12345678',
    branchName: '',
    slug: 'goal-12345678',
    reused: false,
  })),
  sessionDirExists: vi.fn(async (_args: unknown) => true),
  scratchDirPrepare: vi.fn(async (_args: unknown) => '/tmp/goodboy-root/scratch/session-story'),
  scratchDirRemove: vi.fn(async (_args: unknown) => undefined),
  removeWorktree: vi.fn(async (_repoPath: string, _worktreePath: string) => undefined),
  removeWorktreeChecked: vi.fn(async (_args: { worktreePath: string }) => ({
    kind: 'removed',
    path: _args.worktreePath,
  })),
  worktreeWriterStatus: vi.fn(async (_args: { path: string }) => ({
    path: _args.path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  removeSessionDirectory: vi.fn(async (_args: unknown) => undefined),
  worktreeStatus: vi.fn(async (_path: string) => cleanWorkingTree),
  worktreeChangedFiles: vi.fn(async (_path: string) => ({ files: [], numstat: '' })),
  insertSession: vi.fn(async () => undefined),
  insertSessionEvent: vi.fn(
    async (_params: { readonly event: { readonly kind: string } }) => undefined,
  ),
  insertSessionWorktree: vi.fn(async () => undefined),
  deleteSessionWorktreeForProject: vi.fn(async () => undefined),
  updateSessionWorktreeBranch: vi.fn(async () => undefined),
  updateSessionActiveProject: vi.fn(async () => undefined),
  listWorktreesForSession: vi.fn(async () => [] as ReadonlyArray<never>),
  getWorkspaceById: vi.fn(async () => null),
  listProjectsForWorkspace: vi.fn(async () => [] as ReadonlyArray<never>),
  upsertSessionExternalTask: vi.fn(async () => undefined),
  upsertContextSlot: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
};

const freeWriterLease = ({ path }: { readonly path: string }) => ({
  path,
  holder: null,
  token: null,
  runId: null,
  isGranted: false,
  hasExited: false,
  waiting: [],
});

export const resetStorySpies = () => {
  for (const spy of Object.values(storySpies)) {
    spy.mockReset();
  }
  storySpies.removeWorktreeChecked.mockImplementation(
    async ({ worktreePath }: { worktreePath: string }) => ({
      kind: 'removed',
      path: worktreePath,
    }),
  );
  storySpies.worktreeWriterStatus.mockImplementation(async ({ path }: { path: string }) =>
    freeWriterLease({ path }),
  );
};

export const dbModuleMock = () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  getWorkspaceById: storySpies.getWorkspaceById,
  listProjectsForWorkspace: storySpies.listProjectsForWorkspace,
  findProjectByRootPath: vi.fn(async () => null),
  getProjectById: vi.fn(async () => null),
  insertProject: vi.fn(async () => undefined),
  reconnectProject: vi.fn(async () => undefined),
  describeProjectAdoption: vi.fn(async () => null),
  moveProjectToWorkspace: vi.fn(async () => ({
    movedSessionCount: 0,
    ambiguousSessionCount: 0,
  })),
  mergeWorkspaces: vi.fn(async () => undefined),
  insertMessage: vi.fn(),
  insertProviderRun: vi.fn(),
  insertSession: storySpies.insertSession,
  insertSessionWorktree: storySpies.insertSessionWorktree,
  insertSessionEvent: storySpies.insertSessionEvent,
  deleteSessionWorktreeForProject: storySpies.deleteSessionWorktreeForProject,
  updateSessionMountLifecycle: vi.fn(async () => true),
  purgeSessionMounts: vi.fn(async () => undefined),
  listSessionMounts: vi.fn(async () => []),
  insertTelemetry: vi.fn(),
  insertWorkspace: vi.fn(),
  listContextSlotsForSession: vi.fn(async () => []),
  listMessagesForSession: vi.fn(async () => []),
  listSessionsForWorkspace: vi.fn(async () => []),
  listArchivedSessionsForWorkspace: vi.fn(async () => []),
  listTelemetryForSession: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => []),
  listWorktreesForTask: vi.fn(async () => []),
  listWorktreesForSession: storySpies.listWorktreesForSession,
  listWorktreesForSessions: vi.fn(async () => new Map()),
  deleteWorktreesForSession: vi.fn(),
  deleteSession: storySpies.deleteSession,
  deleteFileVersionsForSession: vi.fn(async () => undefined),
  updateSessionWorktreeBranch: storySpies.updateSessionWorktreeBranch,
  updateSessionWorktreeRepoSlug: vi.fn(async () => undefined),
  updateSessionActiveProject: storySpies.updateSessionActiveProject,
  upsertSessionExternalTask: storySpies.upsertSessionExternalTask,
  deleteSessionExternalTask: vi.fn(),
  listExternalTasksForWorkspace: vi.fn(async () => []),
  listIntegrationBindingsForWorkspace: vi.fn(async () => []),
  getIntegrationBinding: vi.fn(async () => null),
  upsertIntegrationBinding: vi.fn(),
  deleteIntegrationBinding: vi.fn(),
  deleteIntegrationBindingsForProvider: vi.fn(async () => undefined),
  summarizeSessionTelemetry: vi.fn(async () => null),
  summarizeWorkspaceTelemetry: vi.fn(async () => null),
  summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
  touchWorkspaceLastAccessed: vi.fn(async () => undefined),
  updateProviderRunStatus: vi.fn(),
  updateSessionState: vi.fn(),
  upsertContextSlot: storySpies.upsertContextSlot,
  insertOpenQuestion: vi.fn(async () => undefined),
  markOpenQuestionsResolvedByText: vi.fn(async () => 0),
  listResolvedQuestionTextsForSession: vi.fn(async () => []),
  insertTurnEvent: vi.fn(async () => undefined),
  insertTurnEventsBatch: vi.fn(async () => undefined),
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
});

export const tauriCoreModuleMock = () => ({
  invoke: (cmd: unknown, args?: unknown) => storySpies.tauriInvoke(cmd, args),
});

export const tauriEventModuleMock = () => ({ listen: vi.fn() });

export const dbLibModuleMock = () => ({
  runDbMigrations: vi.fn(),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
});

export const turnModuleMock = () => ({
  runTurn: (args: unknown) => storySpies.runTurn(args),
  cancelTurn: (runId: unknown) => storySpies.cancelTurn(runId),
  listLiveRunIds: vi.fn(async () => new Set<string>()),
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
  writeAttachment: () => storySpies.writeAttachment(),
});

export const permissionsModuleMock = () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionAuditInsert: vi.fn(),
  invokeAuditRetryEnqueue: vi.fn(async () => undefined),
  invokeAuditRetryDrain: vi.fn(async () => []),
  invokeAuditRetryUpdate: vi.fn(async () => undefined),
  invokeAuditRetryDelete: vi.fn(async () => undefined),
  useEffectivePermissionRules: () => [],
});

export const providersModuleMock = () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(),
  getCursorStatus: vi.fn(),
  getCodexStatus: vi.fn(),
  getProviderStatus: vi.fn(),
});

export const routingModuleMock = () => ({
  resolveProviderForTurn: vi.fn(async () => ({
    selectedProvider: 'anthropic',
    selectedModel: 'claude-3-5-sonnet-latest',
    reason: 'preference',
  })),
});

export const budgetModuleMock = () => ({
  invokeBudgetRuleList: vi.fn(async () => []),
  invokeBudgetRuleUpsert: vi.fn(),
  invokeBudgetRuleDelete: vi.fn(),
  invokeBudgetAlertsList: () => storySpies.invokeBudgetAlertsList(),
  invokeBudgetAlertDismiss: vi.fn(),
  invokeSessionBudgetGet: vi.fn(),
  invokeSessionBudgetSet: vi.fn(),
  invokeCheckProviderBudget: vi.fn(),
});

export const skillsModuleMock = () => ({
  invokeSkillList: vi.fn(async () => []),
  invokeSkillUpsert: vi.fn(),
  invokeSkillDelete: vi.fn(),
  invokeSkillRescan: vi.fn(),
  resolveSkillInvocation: vi.fn(),
});

export const workflowsModuleMock = () => ({
  invokeWorkflowList: vi.fn(async () => []),
  invokeWorkflowUpsert: vi.fn(),
  invokeWorkflowDelete: vi.fn(),
  invokeWorkflowsForSession: vi.fn(async () => []),
  invokeStepDefList: vi.fn(async () => []),
  invokeStepDefUpsert: vi.fn(),
  invokeStepDefDelete: vi.fn(),
  invokeAgentList: (sessionId: unknown) => storySpies.invokeAgentList(sessionId),
  invokeAgentInsert: vi.fn(),
  invokeAgentUpdateStatus: vi.fn(async () => undefined),
  invokeAgentMarkViewed: vi.fn(async () => undefined),
  invokeAgentSetDone: vi.fn(async () => undefined),
});

export const plansModuleMock = () => ({
  listPlansForSession: vi.fn(async () => []),
  upsertPlan: vi.fn(),
  setPlanStatus: vi.fn(),
  setPlanBody: vi.fn(),
  deletePlan: vi.fn(),
  addPlanConsumption: vi.fn(),
  listConsumptionsForPlan: vi.fn(async () => []),
});

export const worktreeModuleMock = () => ({
  createWorktree: (args: unknown) => storySpies.createWorktree(args),
  createSessionDir: (args: unknown) => storySpies.createSessionDir(args),
  removeWorktree: (repoPath: string, worktreePath: string) =>
    storySpies.removeWorktree(repoPath, worktreePath),
  removeWorktreeChecked: (args: { repoPath: string; worktreePath: string }) =>
    storySpies.removeWorktreeChecked(args),
  worktreeWriterStatus: (args: { path: string }) => storySpies.worktreeWriterStatus(args),
  worktreeDirectorySize: vi.fn(async ({ path }: { path: string }) => ({
    path,
    sizeBytes: 1024,
    isPartial: false,
    exists: true,
  })),
  removeSessionDirectory: (args: unknown) => storySpies.removeSessionDirectory(args),
  sessionDirExists: (args: unknown) => storySpies.sessionDirExists(args),
  scratchDirPrepare: (args: unknown) => storySpies.scratchDirPrepare(args),
  scratchDirRemove: (args: unknown) => storySpies.scratchDirRemove(args),
  worktreeChangedFiles: (path: string) => storySpies.worktreeChangedFiles(path),
  worktreeStatus: (path: string) => storySpies.worktreeStatus(path),
  changeWorktreeBranch: vi.fn(async () => undefined),
  invalidateLocalBranchesCache: vi.fn(),
});

export const repoModuleMock = () => ({ validateGitRepo: vi.fn() });

export const emptyOverrides: OverrideSettings = {
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
};

type WorkspaceOverridesInput = Partial<Workspace> & { readonly id: WorkspaceId };

export const buildStoryWorkspace = (overrides: WorkspaceOverridesInput): Workspace => ({
  name: 'Acme',
  slug: 'acme',
  sessionsRoot: null,
  overrides: emptyOverrides,
  createdAt: STORY_NOW,
  updatedAt: STORY_NOW,
  ...overrides,
});

type ProjectOverridesInput = Partial<Project> & {
  readonly id: ProjectId;
  readonly workspaceId: WorkspaceId;
};

export const buildStoryProject = (overrides: ProjectOverridesInput): Project => ({
  name: 'app',
  rootPath: '/tmp/app',
  kind: 'repo',
  overrides: emptyOverrides,
  createdAt: STORY_NOW,
  updatedAt: STORY_NOW,
  ...overrides,
});

type SessionOverridesInput = Partial<Session> & {
  readonly id: SessionId;
  readonly workspaceId: WorkspaceId;
};

export const buildStorySession = (overrides: SessionOverridesInput): Session => ({
  goal: 'ship the thing',
  state: { kind: 'draft' },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
  permissionMode: 'bypassPermissions',
  autoRun: false,
  titleUserEdited: false,
  workflowRuns: [],
  createdAt: STORY_NOW,
  updatedAt: STORY_NOW,
  ...overrides,
});

type AgentOverridesInput = Partial<Agent> & {
  readonly id: AgentId;
  readonly sessionId: SessionId;
};

export const buildStoryAgent = (overrides: AgentOverridesInput): Agent => ({
  ordinal: 0,
  name: 'agent 1',
  status: 'pending',
  ...overrides,
});

export const connectedAnthropicState = () => ({
  providers: [
    {
      id: 'anthropic',
      binary: 'claude',
      connection: 'connected',
      name: 'Claude',
      installation: 'installed',
    } as never,
  ],
  authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
});

export async function* emptyTurnStream(): AsyncIterable<TurnEvent> {}

export const assistantTurnStream = (text: string) =>
  async function* stream(): AsyncIterable<TurnEvent> {
    yield {
      kind: 'assistant_text',
      runId: 'run-story' as never,
      delta: text,
      at: STORY_NOW,
    };
  };

export const recordedEventKinds = (): ReadonlyArray<string> =>
  storySpies.insertSessionEvent.mock.calls.map(([{ event }]) => event.kind);

export const recordedEvent = (
  kind: string,
): { readonly payload?: Record<string, unknown> } | undefined =>
  storySpies.insertSessionEvent.mock.calls
    .map(
      ([{ event }]) =>
        event as { readonly kind: string; readonly payload?: Record<string, unknown> },
    )
    .find((event) => event.kind === kind);
