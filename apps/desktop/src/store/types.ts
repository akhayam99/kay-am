import type { ResolveState } from './slices/resolve/state';
import type { OrphanWorktree } from '../features/worktree/worktree';
import type { StorageStats } from './slices/storage';
import type { MountCleanupState } from './slices/mount-cleanup/state';
import type { PrSeriesState } from './slices/pr-series/state';
import type { Notification, NotificationCounts, TelemetrySummary } from '@goodboy/db';
import type {
  Agent,
  AgentId,
  BudgetAlert,
  BudgetRule,
  ContextSlot,
  ContextSlotHistoryEntry,
  DiffComment,
  FileVersion,
  GhTokenStatus,
  GoalAttachment,
  IntegrationCredential,
  IntegrationCredentialUsage,
  IsoDateTime,
  LinkedIssue,
  Message,
  OpenQuestion,
  OpenQuestionId,
  OrchestratorRouting,
  OverrideSettings,
  PlanConsumption,
  PlanId,
  PlanWithCount,
  PrDetail,
  PrReviewDraft,
  Project,
  ProjectId,
  ProviderCredential,
  ProviderId,
  ProviderRunId,
  PullRequestState,
  Session,
  SessionBudget,
  SessionEvent,
  SessionExternalTask,
  SessionId,
  MountBranchObservation,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  SessionMountView,
  SessionProjectMount,
  SessionViewPrefs,
  Skill,
  StepDef,
  TelemetryRecord,
  TurnEvent,
  TurnState,
  Workflow,
  WorkflowRunId,
  Workspace,
  WorkspaceGitStatus,
  WorkspaceId,
  IntegrationBinding,
  ProjectScript,
} from '@goodboy/types';
import type { SessionWorktree } from '@goodboy/db';
import type { AgentKind } from '../features/session/agent-kind';
import type { GitlabMergeRequest } from '../features/integrations/gitlab/client';
import type {
  BitbucketPullRequest,
  BitbucketRepo,
} from '../features/integrations/bitbucket/client';
import type { SessionBitbucketPrEntry } from './slices/bitbucket-pr/state';
import type { SlackThreadsSliceState } from './slices/slack-threads/state';
import type {
  ProviderAuthResults,
  ProviderInfo,
  ProviderStatus,
} from '../features/providers/providers';
import type { ProviderCooldowns } from '../features/providers/routing';
import type { ScriptGroup, ScriptRunRecord } from '../features/scripts/scripts';
import type { DiscoveredScriptScan } from './slices/scripts/state';
import type { DetectedEditor } from '../shared/lib/editor';
import type { TerminalTab, TerminalTabId } from '../shared/types/terminal';
import type { DraftAttachment } from './slices/agents/setAgentAttachments';
import type { AgentQueuedTurn } from './slices/agents/setAgentQueue';
import type { ProviderSpendEntry } from './slices/budget';
import type { BugReportDraftState } from './slices/bugReportDraft/state';
import type { ChangelogState } from './slices/changelog/state';
import type { ProviderConnectMap, ProviderLifecycleMap } from './slices/providers';
import type { ReviewPrsState } from './slices/review-prs/types';
import type { ResolveItemDraft } from '../features/resolve/resolveItemDraft';
import type {
  DiffFocus,
  FocusedExternalTask,
  LensHistory,
  LensKind,
  ResolveDiffReturn,
  ResolveQueueView,
  ReviewLensIntent,
  SessionCreation,
  SessionStudio,
} from './slices/session-view';
import type { PanelSection } from './slices/sidebar/types';
import type { UpdaterState } from './slices/updater/state';
import type { WorkflowBuilderDraft } from './slices/workflowDrafts/types';
import type { WorkflowGeneration, WorkflowStudioDraft } from './slices/workflowStudio/types';

export type BootPhase =
  | 'pending'
  | 'migrating'
  | 'loading-settings'
  | 'detecting-cli'
  | 'loading-workspaces'
  | 'restoring-session'
  | 'ready'
  | 'error';

export type SessionNudge =
  | {
      readonly kind: 'plan-ready';
      readonly id: string;
      readonly agentId: AgentId;
      readonly planId: PlanId | null;
      readonly planTitle: string;
    }
  | {
      readonly kind: 'handoff-suggested';
      readonly id: string;
      readonly agentId: AgentId;
      readonly targetKind: AgentKind;
      readonly reason: string;
      readonly planId: PlanId | null;
    };

export type SessionLoadingFlags = {
  readonly agents: boolean;
  readonly transcript: boolean;
  readonly telemetry: boolean;
  readonly slots: boolean;
  readonly plans: boolean;
  readonly summary: boolean;
};

export type SessionSlotsLoad = 'loaded' | 'failed';

export type SessionGitlabMrState = {
  readonly mr: GitlabMergeRequest | null;
  readonly fetchedAt: IsoDateTime | null;
  readonly loading: boolean;
  readonly error: string | null;
};

export type SessionGithubState = {
  readonly pr: PullRequestState | null;
  readonly linkedIssues: ReadonlyArray<LinkedIssue>;
  readonly fetchedAt: IsoDateTime | null;
  readonly failedAt: IsoDateTime | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly detail: PrDetail | null;
  readonly detailFetchedAt: IsoDateTime | null;
  readonly detailLoading: boolean;
  readonly detailError: string | null;
};

export type MountGithubState = SessionGithubState & {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
  readonly revision: number;
  readonly repository: string | null;
  readonly host: string | null;
  readonly branch: string;
  readonly prs: ReadonlyArray<PullRequestState>;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

export type MountGitlabMrState = SessionGitlabMrState & {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
  readonly revision: number;
  readonly host: string | null;
  readonly projectPath: string | null;
  readonly branch: string;
  readonly mrs: ReadonlyArray<GitlabMergeRequest>;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

export type MountBitbucketPrState = SessionBitbucketPrEntry & {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
  readonly revision: number;
  readonly host: string | null;
  readonly repo: BitbucketRepo | null;
  readonly repository: string | null;
  readonly branch: string;
  readonly prs: ReadonlyArray<BitbucketPullRequest>;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

export type SummarizerSessionStatus = {
  readonly status: 'idle' | 'running' | 'error';
  readonly lastUpdate: IsoDateTime | null;
  readonly error: string | null;
  readonly lastUsage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly estimatedCostUsd: number;
  } | null;
  readonly lastAttempt: {
    readonly turnInput: string;
    readonly turnOutput: string;
  } | null;
};

export type PendingOrchestration = {
  readonly sessionId: SessionId;
  readonly bypassGate: boolean;
  readonly extraHints: ReadonlyArray<string>;
  readonly routing?: OrchestratorRouting;
};

type AppSliceState = ResolveState &
  UpdaterState &
  ChangelogState &
  SlackThreadsSliceState &
  BugReportDraftState;

export type AppState = AppSliceState & {
  readonly selectedProjectIds: Readonly<Record<WorkspaceId, ReadonlyArray<string>>>;
  readonly workspaces: ReadonlyArray<Workspace>;
  readonly projects: ReadonlyArray<Project>;
  readonly workspaceIntegrations: Readonly<Record<WorkspaceId, ReadonlyArray<IntegrationBinding>>>;
  readonly integrationCredentials: ReadonlyArray<IntegrationCredential>;
  readonly integrationCredentialUsage: IntegrationCredentialUsage;
  readonly projectGitStatus: Readonly<Record<ProjectId, WorkspaceGitStatus>>;
  readonly projectCheckoutPulling: Readonly<Record<ProjectId, boolean>>;
  readonly sessionExternalTasks: Readonly<Record<SessionId, ReadonlyArray<SessionExternalTask>>>;
  readonly sessionEvents: Readonly<Record<SessionId, ReadonlyArray<SessionEvent> | undefined>>;
  readonly currentWorkspaceId: WorkspaceId | null;
  readonly windowPresence: Readonly<Record<string, WorkspaceId | null>>;
  readonly sessions: ReadonlyArray<Session>;
  readonly archivedSessions: Readonly<Record<WorkspaceId, ReadonlyArray<Session>>>;
  readonly currentSessionId: SessionId | null;
  readonly pendingTitleFocusSessionId: SessionId | null;
  readonly settings: Readonly<Record<string, string>>;
  readonly sessionSummary: TelemetrySummary | null;
  readonly providerStatus: ProviderStatus | null;
  readonly cursorStatus: ProviderStatus | null;
  readonly codexStatus: ProviderStatus | null;
  readonly geminiStatus: ProviderStatus | null;
  readonly authResults: ProviderAuthResults | null;
  readonly providers: ReadonlyArray<ProviderInfo>;
  readonly providerLifecycle: ProviderLifecycleMap;
  readonly providerConnect: ProviderConnectMap;
  readonly providerCredentials: ReadonlyArray<ProviderCredential>;
  readonly providerCooldowns: ProviderCooldowns;
  readonly hydrated: boolean;
  readonly bootPhase: BootPhase;
  readonly error: string | null;
  readonly transcripts: Readonly<Record<string, ReadonlyArray<TurnEvent>>>;
  readonly messages: Readonly<Record<string, ReadonlyArray<Message>>>;
  readonly sessionWorktrees: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly sessionWorktreeRecords?: Readonly<Record<string, ReadonlyArray<SessionWorktree>>>;
  readonly orphanWorktrees: Readonly<Record<string, ReadonlyArray<OrphanWorktree>>>;
  readonly sessionProjectMounts: Readonly<Record<string, ReadonlyArray<SessionProjectMount>>>;
  readonly sessionMounts: Readonly<Record<string, ReadonlyArray<SessionMountView>>>;
  readonly mountBranchObservations: Readonly<Record<string, ReadonlyArray<MountBranchObservation>>>;
  readonly sessionActiveMount: Readonly<Record<string, MountId | null>>;
  readonly mountCleanupProposals: MountCleanupState['mountCleanupProposals'];
  readonly retainedWorktreePaths: MountCleanupState['retainedWorktreePaths'];
  readonly prSeries: PrSeriesState['prSeries'];
  readonly sessionLanguageAnchor: Readonly<Record<SessionId, string>>;
  readonly sessionActiveProject: Readonly<Record<string, ProjectId>>;
  readonly sessionBranches: Readonly<Record<string, string>>;
  readonly sessionTelemetry: Readonly<Record<string, ReadonlyArray<TelemetryRecord>>>;
  readonly workspaceSummary: TelemetrySummary | null;
  readonly sessionSlots: Readonly<Record<string, ReadonlyArray<ContextSlot>>>;
  readonly slotHistory: Readonly<
    Record<string, Readonly<Record<string, ReadonlyArray<ContextSlotHistoryEntry>>>>
  >;
  readonly slotHistoryCounts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly sessionSlotsLoad: Readonly<Record<string, SessionSlotsLoad>>;
  readonly summarizerStatus: Readonly<Record<string, SummarizerSessionStatus>>;
  readonly storageStats: StorageStats | null;
  readonly storageStatsLoading: boolean;
  readonly budgetRules: ReadonlyArray<BudgetRule>;
  readonly sessionBudgets: Readonly<Record<SessionId, SessionBudget>>;
  readonly providerSpendBreakdown: ReadonlyArray<ProviderSpendEntry>;
  readonly budgetAlerts: ReadonlyArray<BudgetAlert>;
  readonly skills: Readonly<Record<WorkspaceId, ReadonlyArray<Skill>>>;
  readonly projectScripts: Readonly<Record<WorkspaceId, ReadonlyArray<ProjectScript>>>;
  readonly scriptRuns: Readonly<Record<SessionId, Readonly<Record<string, ScriptRunRecord>>>>;
  readonly discoveredScripts: Readonly<
    Record<SessionId, Readonly<Record<string, ReadonlyArray<ScriptGroup>>>>
  >;
  readonly discoveredScriptScans: Readonly<
    Record<SessionId, Readonly<Record<string, DiscoveredScriptScan>>>
  >;
  readonly phaseTemplates: Readonly<Record<WorkspaceId, ReadonlyArray<Workflow>>>;
  readonly stepLibrary: Readonly<Record<WorkspaceId, ReadonlyArray<StepDef>>>;
  readonly sessionWorkflows: Readonly<Record<SessionId, ReadonlyArray<Workflow>>>;
  readonly sessionPhaseRuns: Readonly<Record<SessionId, ReadonlyArray<Agent>>>;
  readonly orchestratingWorkflowRuns: Readonly<Record<WorkflowRunId, boolean>>;
  readonly pendingOrchestrations: Readonly<Record<WorkflowRunId, PendingOrchestration>>;
  readonly pendingAdvanceSessions: ReadonlySet<SessionId>;
  readonly announcedWorkflowBlocks: Readonly<Record<WorkflowRunId, string>>;
  readonly announcedRunBudget: Readonly<Record<WorkflowRunId, number>>;
  readonly selectedAgentId: Readonly<Record<SessionId, AgentId | null>>;
  readonly agentRunHistory: Readonly<Record<AgentId, ReadonlyArray<ProviderRunId>>>;
  readonly agentTurnState: Readonly<Record<AgentId, TurnState>>;
  readonly clusterStartAttempts: Readonly<Record<AgentId, number>>;
  readonly unknownPayloadCounts: Readonly<Record<string, number>>;
  readonly detectedEditors: ReadonlyArray<DetectedEditor>;
  readonly workspaceOverrides: Readonly<Record<WorkspaceId, OverrideSettings>>;
  readonly sessionOverrides: Readonly<Record<SessionId, OverrideSettings>>;
  readonly unreadWorkspaceIds: ReadonlySet<WorkspaceId>;
  readonly sessionPanelExpanded: Readonly<
    Record<SessionId, Partial<Record<PanelSection, boolean>>>
  >;
  readonly githubStatus: GhTokenStatus | null;
  readonly mountGithub: Readonly<Record<MountId, MountGithubState>>;
  readonly mountSelectedPr: Readonly<Record<MountId, MountPullRequestIdentity | null>>;
  readonly sessionGithub: Readonly<Record<SessionId, SessionGithubState>>;
  readonly sessionProjectPrs: Readonly<
    Record<SessionId, Readonly<Record<ProjectId, ReadonlyArray<PullRequestState>>>>
  >;
  readonly sessionSelectedPrNumber: Readonly<Record<SessionId, number | null>>;
  readonly mountGitlabMr: Readonly<Record<MountId, MountGitlabMrState>>;
  readonly sessionGitlabMr: Readonly<Record<SessionId, SessionGitlabMrState>>;
  readonly mountBitbucketPr: Readonly<Record<MountId, MountBitbucketPrState>>;
  readonly mountSelectedBitbucketPr: Readonly<Record<MountId, MountPullRequestIdentity | null>>;
  readonly sessionBitbucketPr: Readonly<Record<SessionId, SessionBitbucketPrEntry>>;
  readonly sessionBitbucketRepo: Readonly<Record<SessionId, BitbucketRepo>>;
  readonly reviewPrs: Readonly<Record<WorkspaceId, ReviewPrsState>>;
  readonly reviewDrafts: Readonly<Record<SessionId, ReadonlyArray<PrReviewDraft>>>;
  readonly volatilePermissionAllows: ReadonlySet<string>;
  readonly agentModelOverride: Readonly<Record<AgentId, string>>;
  readonly agentProviderOverride: Readonly<Record<AgentId, ProviderId>>;
  readonly agentEffortOverride: Readonly<Record<AgentId, string>>;
  readonly agentKindOverride: Readonly<Record<AgentId, AgentKind>>;
  readonly agentDraft: Readonly<Record<AgentId, string>>;
  readonly workflowDrafts: Readonly<Record<SessionId, WorkflowBuilderDraft | undefined>>;
  readonly workflowStudioDrafts: Readonly<Record<WorkspaceId, WorkflowStudioDraft | undefined>>;
  readonly workflowGenerations: Readonly<Record<WorkspaceId, WorkflowGeneration | undefined>>;
  readonly visibleWorkflowStudioWorkspaceId: WorkspaceId | null;
  readonly agentAttachments: Readonly<Record<AgentId, ReadonlyArray<DraftAttachment>>>;
  readonly agentQueue: Readonly<Record<AgentId, ReadonlyArray<AgentQueuedTurn>>>;
  readonly diffComments: Readonly<Record<string, ReadonlyArray<DiffComment>>>;
  readonly sessionFileVersions: Readonly<Record<SessionId, ReadonlyArray<FileVersion> | undefined>>;
  readonly sessionFileVersionsLoading: Readonly<Record<SessionId, boolean>>;
  readonly sessionFileVersionSelectedPath: Readonly<Record<SessionId, string | null>>;
  readonly sessionAttachments: Readonly<Record<SessionId, ReadonlyArray<GoalAttachment>>>;
  readonly workflowRunAttachments: Readonly<Record<WorkflowRunId, ReadonlyArray<GoalAttachment>>>;
  readonly notifications: ReadonlyArray<Notification>;
  readonly notificationsLoading: boolean;
  readonly notificationCounts: NotificationCounts;
  readonly sessionPlans: Readonly<Record<SessionId, ReadonlyArray<PlanWithCount>>>;
  readonly planConsumptions: Readonly<Record<PlanId, ReadonlyArray<PlanConsumption>>>;
  readonly sessionOpenQuestions: Readonly<Record<SessionId, ReadonlyArray<OpenQuestion>>>;
  readonly sessionAnsweredQuestions: Readonly<Record<SessionId, ReadonlyArray<OpenQuestion>>>;
  readonly sessionDismissedQuestions: Readonly<Record<SessionId, ReadonlyArray<OpenQuestion>>>;
  readonly openQuestionScrollTarget: {
    readonly agentId: AgentId;
    readonly questionId: OpenQuestionId;
  } | null;
  readonly sessionNudges: Readonly<Record<SessionId, SessionNudge | null>>;
  readonly sessionLoading: Readonly<Record<SessionId, SessionLoadingFlags>>;
  readonly boardReady: boolean;
  readonly scriptsLensScope: { readonly projectId: ProjectId } | null;
  readonly reviewLensIntent: ReviewLensIntent | null;
  readonly sessionViewPrefs: Readonly<Record<WorkspaceId, SessionViewPrefs>>;
  readonly activeLens: Readonly<Record<SessionId, LensKind | null>>;
  readonly lensHistory: Readonly<Record<SessionId, LensHistory>>;
  readonly workflowExpand: Readonly<Record<SessionId, Readonly<Record<string, boolean>>>>;
  readonly focusedWorkflowRunId: Readonly<Record<SessionId, string | null>>;
  readonly diffFocus: Readonly<Record<SessionId, DiffFocus | null>>;
  readonly diffMountPath: Readonly<Record<SessionId, string | null>>;
  readonly resolveQueueView: Readonly<Record<SessionId, ResolveQueueView>>;
  readonly resolveDiffReturn: Readonly<Record<SessionId, ResolveDiffReturn | null>>;
  readonly resolveItemDrafts: Readonly<
    Record<SessionId, Readonly<Record<string, ResolveItemDraft>>>
  >;
  readonly sessionCreations: Readonly<Record<SessionId, ReadonlyArray<SessionCreation>>>;
  readonly sessionStudio: Readonly<Record<SessionId, SessionStudio | null>>;
  readonly focusedPlanId: Readonly<Record<SessionId, PlanId | null>>;
  readonly focusedGithubIssueNumber: Readonly<Record<SessionId, number | null>>;
  readonly focusedExternalTask: Readonly<Record<SessionId, FocusedExternalTask | null>>;
  readonly terminalSessions: Readonly<Record<SessionId, 'open' | 'closed'>>;
  readonly terminalTabs: Readonly<Record<SessionId, readonly TerminalTab[]>>;
  readonly activeTerminalTab: Readonly<Record<SessionId, TerminalTabId | null>>;
};
