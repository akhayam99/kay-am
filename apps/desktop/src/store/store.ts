import { createResolveSlice } from './slices/resolve';
import { resolveInitialState } from './slices/resolve/state';
import { create } from 'zustand';
import { type SlotKey } from '@goodboy/core';
import {
  type SessionConfigUpdate,
  type AgentConfigUpdate,
  type NotificationAction,
  type NotificationKind,
  type NotificationSeverity,
} from '@goodboy/db';
import type {
  AgentId,
  AgentSourceKind,
  BudgetAlert,
  BudgetRule,
  ClaudePermissionMode,
  AttachmentInput,
  GoalAttachmentOwner,
  OverrideSettings,
  OpenQuestion,
  OpenQuestionId,
  OrchestratorRouting,
  PendingResolutionOutcome,
  PermissionScope,
  PlanId,
  PlanStatus,
  StepId,
  Session,
  SessionId,
  SessionProviderPreference,
  StepDefId,
  Workflow,
  WorkflowId,
  WorkflowRunId,
  WorkflowTriggerMode,
  WorkflowExecutionMode,
  WorkflowSpendLimitMode,
  ProviderId,
  Project,
  ProjectId,
  ProviderCredential,
  CredentialId,
  FileVersionId,
  ProviderRunId,
  VerbosityLevel,
  SkillId,
  TurnEvent,
  TurnProviderOverride,
  SessionExternalTaskProvider,
  SessionExternalTask,
  SessionMountView,
  SessionProjectMount,
  SessionEventKind,
  SessionEventPayload,
  IntegrationBindingProvider,
  IntegrationCredentialId,
  Workspace,
  WorkspaceId,
  WorkspaceProfile,
  IntegrationBinding,
  WorkspaceIntegrationProvider,
  MountCleanupProposal,
  MountId,
  PrSeries,
  PrSeriesMember,
  PrSeriesView,
  ProjectScriptId,
  GhTokenStatus,
  PrMergeMethod,
  SessionViewPrefs,
  SessionSortKey,
  SessionGroupKey,
  TaskModelPreference,
  ReviewablePr,
  PrReviewDraft,
  RoleModelPreferences,
} from '@goodboy/types';
import type { ExtractedReviewComment } from '@goodboy/core';
import { buildProviderList, type ProviderStatus } from '../features/providers/providers';
import { type RewrittenHead } from '../features/worktree/worktree';
import { type SkillUpsertArgs } from '../features/skills/skills';
import type { ScriptRunResult } from '../features/scripts/scripts';
import { type WorkflowUpsertArgs, type StepDefUpsertArgs } from '../features/workflows/workflows';
import { type AgentKind } from '../features/session/agent-kind';
import type { TerminalTabId, TerminalTabStatus } from '../shared/types/terminal';
import { createNotificationsSlice } from './slices/notifications';
import { createNudgesSlice } from './slices/nudges';
import { createPlansSlice } from './slices/plans';
import { createOpenQuestionsSlice } from './slices/open-questions';
import { createBudgetSlice } from './slices/budget';
import { createSkillsSlice } from './slices/skills';
import { createStorageSlice } from './slices/storage';
import { createDiffCommentsSlice } from './slices/diff-comments';
import { createFileVersionsSlice } from './slices/file-versions';
import { createSessionEventsSlice } from './slices/session-events';
import { createAttachmentsSlice } from './slices/attachments';
import { createGithubSlice } from './slices/github';
import type { CreatePrInput } from './slices/github/createPrForSession';
import type { RefreshPrOptions } from './slices/github/refreshMountPr';
import { createGitlabMrSlice, initialGitlabMrState } from './slices/gitlab-mr';
import type { CreateMrInput, MergeMrInput, RefreshMrOptions } from './slices/gitlab-mr';
import {
  createBitbucketPrSlice,
  initialBitbucketPrState,
  type BitbucketPrCommentParams,
  type BitbucketPrReplyParams,
  type BitbucketPrWriteParams,
  type RefreshSessionBitbucketPrOptions,
} from './slices/bitbucket-pr';
import {
  createSlackThreadsSlice,
  initialSlackThreadsState,
  type RefreshSlackThreadOptions,
  type SlackChannelParams,
  type SlackReactionParams,
  type SlackReplyParams,
  type SlackThreadParams,
  type SlackWorkspaceParams,
} from './slices/slack-threads';
import { createReviewPrsSlice } from './slices/review-prs';
import { createReviewDraftsSlice } from './slices/review-drafts';
import type {
  AddReviewDraftInput,
  PublishPrReviewOpts,
  PublishPrReviewResult,
} from './slices/review-drafts';
import { createIntegrationsSlice } from './slices/integrations';
import { createSidebarSlice } from './slices/sidebar';
import type { PanelSection } from './slices/sidebar/types';
import { createSessionViewSlice } from './slices/session-view';
import { createSessionFiltersSlice } from './slices/sessionFilters';
import type {
  GetSelectedProjectIdsParams,
  SetSelectedProjectIdsParams,
} from './slices/sessionFilters/types';
import { createInitialSessionViewState } from './slices/session-view/createInitialSessionViewState';
import type {
  DiffFocus,
  LensKind,
  SessionCreationId,
  SessionCreationKind,
  SessionStudio,
} from './slices/session-view';
import type { SpawnFocus } from './slices/session-view/spawnFocus';
import { createTerminalSlice } from './slices/terminal';
import { createScriptsSlice } from './slices/scripts';
import { initialScriptsState } from './slices/scripts/state';
import { createPermissionsSlice } from './slices/permissions';
import {
  createProvidersSlice,
  INITIAL_CONNECT_MAP,
  INITIAL_LIFECYCLE_MAP,
} from './slices/providers';
import { createAgentsSlice } from './slices/agents';
import type { DraftAttachment } from './slices/agents/setAgentAttachments';
import type { AgentQueuedTurn } from './slices/agents/setAgentQueue';
import { createWorkflowDraftsSlice } from './slices/workflowDrafts';
import type { WorkflowBuilderDraft } from './slices/workflowDrafts/types';
import { createWorkflowStudioSlice } from './slices/workflowStudio';
import { initialWorkflowStudioState } from './slices/workflowStudio/state';
import type {
  StartWorkflowGenerationParams,
  WorkflowStudioDraft,
} from './slices/workflowStudio/types';
import { createSlotsSlice } from './slices/slots';
import { createOverridesSlice } from './slices/overrides';
import { createCredentialsSlice } from './slices/credentials';
import { createWorkflowsSlice } from './slices/workflows';
import type { CopyWorkflowFromWorkspaceParams } from './slices/workflows/copyWorkflowFromWorkspace';
import type { OrchestrateOptions } from './slices/workflows/orchestrateNextStep';
import type { ActivateWorkflowAgentParams } from './slices/workflows/activateWorkflowAgent';
import { createSettingsSlice } from './slices/settings';
import { createTranscriptsSlice } from './slices/transcripts';
import { createSummariesSlice } from './slices/summaries';
import { createSessionsSlice } from './slices/sessions';
import { createWorkspacesSlice } from './slices/workspaces';
import { createProjectsSlice } from './slices/projects';
import type { AddProjectResult, ProjectAttachConflict } from './slices/projects/addProject';
import type { AddProjectsResult } from './slices/projects/addProjects';
import type { AdoptProjectResult } from './slices/projects/adoptProject';
import { createProjectMountsSlice } from './slices/project-mounts';
import { projectMountsInitialState } from './slices/project-mounts/state';
import { createMountCleanupSlice, mountCleanupInitialState } from './slices/mount-cleanup';
import { createPrSeriesSlice, prSeriesInitialState } from './slices/pr-series';
import type {
  CreatePrSeriesInput,
  LoadPrSeriesInput,
  SetPrSeriesMemberInput,
} from './slices/pr-series';
import type { ArchiveTaskOptions } from './slices/sessions/types';
import type {
  CleanupSessionMountsInput,
  ProposeMountCleanupInput,
  ResolveMountCleanupInput,
  SessionCleanupKeyInput,
  SessionCleanupOutcome,
} from './slices/mount-cleanup';
import type {
  AttachMountInput,
  ForkMountInput,
  InspectMountResult,
  MountKeyInput,
  ResolveMountBranchInput,
  SessionKeyInput,
  SwitchMountInput,
  UnmountMountInput,
  UnmountMountResult,
} from './slices/project-mounts/types';
import type { OpenMountRequestInput } from './slices/project-mounts/openMountRequest';
import { createPresenceSlice } from './slices/presence';
import { createTurnSlice } from './slices/turn';
import type { SendTurnResult } from './slices/turn/types';
import { createWorktreesSlice } from './slices/worktrees';
import { createBootSlice } from './slices/boot';
import { createUpdaterSlice } from './slices/updater';
import { initialUpdaterState } from './slices/updater/state';
import { createChangelogSlice } from './slices/changelog';
import { initialChangelogState } from './slices/changelog/state';
import type { Params as MarkChangelogSeenParams } from './slices/changelog/markChangelogSeen';
import { createBugReportDraftSlice } from './slices/bugReportDraft';
import { initialBugReportDraftState } from './slices/bugReportDraft/state';
import type { Params as SetBugReportDraftParams } from './slices/bugReportDraft/setBugReportDraft';
import type { Params as AddBugReportImagesParams } from './slices/bugReportDraft/addBugReportImages';
import type { Params as RemoveBugReportImageParams } from './slices/bugReportDraft/removeBugReportImage';
import type { LinearViewer } from '../features/integrations/linear/client';
import type { SentryProject } from '../features/integrations/sentry/client';
import type { GitlabUser } from '../features/integrations/gitlab/client';
import type { BitbucketConnection } from '../features/integrations/bitbucket/client';
import type { SlackConnection } from '../features/integrations/slack/client';
import type { JiraUser } from '../features/integrations/jira/client';
import type { ProviderSpendEntry } from './slices/budget';
import type { AppState } from './types';
import type { EvictionMode } from './sessionEviction';
export type { ProviderSpendEntry };
export type {
  AppState,
  BootPhase,
  SessionGithubState,
  SessionGitlabMrState,
  SessionLoadingFlags,
  SessionNudge,
  SummarizerSessionStatus,
  PendingOrchestration,
} from './types';

type SaveScriptParams = {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly id?: ProjectScriptId;
  readonly name: string;
  readonly body: string;
};

type RunScriptParams = {
  readonly sessionId: SessionId;
  readonly scriptId: ProjectScriptId;
  readonly mountId?: MountId;
  readonly cols?: number;
  readonly rows?: number;
};

type DiscoveredScriptsParams = {
  readonly sessionId: SessionId;
  readonly worktreePath: string;
};

type RunDiscoveredScriptParams = {
  readonly sessionId: SessionId;
  readonly scriptId: string;
  readonly name: string;
  readonly command: string;
  readonly cwd: string;
  readonly cols?: number;
  readonly rows?: number;
};

type AppActions = {
  evictSession(params: { readonly sessionId: SessionId; readonly mode: EvictionMode }): void;
  getSelectedProjectIds(params: GetSelectedProjectIdsParams): ReadonlyArray<string>;
  setSelectedProjectIds(params: SetSelectedProjectIdsParams): void;
  hydrate(): Promise<void>;
  retryHydrate(): Promise<void>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  loadChangelog(): Promise<void>;
  reloadChangelog(): Promise<void>;
  hydrateChangelogSeen(): Promise<void>;
  markChangelogSeen(params: MarkChangelogSeenParams): Promise<void>;
  setBugReportDraft(params: SetBugReportDraftParams): void;
  addBugReportImages(params: AddBugReportImagesParams): void;
  removeBugReportImage(params: RemoveBugReportImageParams): void;
  clearBugReportDraft(): void;
  loadDetectedEditors(): Promise<void>;
  setCurrentWorkspace(id: WorkspaceId | null): Promise<void>;
  openWorkspace(id: WorkspaceId, title: string): Promise<void>;
  setWindowPresence(label: string, workspaceId: WorkspaceId | null): void;
  removeWindowPresence(label: string): void;
  setCurrentSession(id: SessionId | null): Promise<void>;
  refreshSessions(workspaceId: WorkspaceId): Promise<void>;
  loadArchivedSessions(workspaceId: WorkspaceId): Promise<void>;
  refreshSessionSummary(sessionId: SessionId): Promise<void>;
  loadSetting(key: string): Promise<string | null>;
  saveSetting(key: string, value: string): Promise<void>;
  refreshProviderStatus(status: ProviderStatus): void;
  refreshProviders(): Promise<void>;
  logoutProvider(providerId: ProviderId): Promise<void>;
  cancelProviderLifecycle(providerId: ProviderId): Promise<void>;
  connectProvider(providerId: ProviderId): Promise<void>;
  cancelProviderConnect(providerId: ProviderId): Promise<void>;
  dismissProviderConnect(providerId: ProviderId): void;
  addWorkspace(input: { rootPath: string; name?: string }): Promise<Workspace>;
  createWorkspace(input: { name: string }): Promise<Workspace>;
  addProject(input: {
    workspaceId: WorkspaceId;
    rootPath: string;
    name?: string;
    requireRepo?: boolean;
  }): Promise<AddProjectResult>;
  addProjects(input: {
    workspaceId: WorkspaceId;
    rootPaths: ReadonlyArray<string>;
  }): Promise<AddProjectsResult>;
  adoptProject(input: {
    projectId: ProjectId;
    targetWorkspaceId: WorkspaceId;
  }): Promise<AdoptProjectResult>;
  previewProjectAdoption(input: {
    workspaceId: WorkspaceId | null;
    rootPath: string;
  }): Promise<ProjectAttachConflict | null>;
  removeProject(input: { projectId: ProjectId }): Promise<void>;
  convertProjectToRepo(input: { projectId: ProjectId; remoteUrl: string }): Promise<Project>;
  updateProjectBaseBranch(input: {
    projectId: ProjectId;
    baseBranch: string | null;
  }): Promise<void>;
  renameWorkspace(input: { workspaceId: WorkspaceId; name: string }): Promise<Workspace>;
  updateWorkspaceProfile(input: {
    workspaceId: WorkspaceId;
    profile: WorkspaceProfile;
  }): Promise<Workspace>;
  deleteWorkspace(id: WorkspaceId): Promise<void>;
  mergeWorkspaces(input: {
    sourceWorkspaceIds: ReadonlyArray<WorkspaceId>;
    targetWorkspaceId: WorkspaceId;
  }): Promise<void>;
  loadProjectGitStatus(input: { projectId: ProjectId }): Promise<void>;
  fastForwardProjectCheckout(input: { projectId: ProjectId }): Promise<void>;
  loadIntegrations(workspaceId: WorkspaceId): Promise<void>;
  loadIntegrationCredentials(): Promise<void>;
  forgetIntegrationCredential(params: { credentialId: IntegrationCredentialId }): Promise<void>;
  disconnectIntegration(params: {
    workspaceId: WorkspaceId;
    provider: WorkspaceIntegrationProvider;
  }): Promise<void>;
  resolveBinding(params: {
    workspaceId: WorkspaceId;
    provider: IntegrationBindingProvider;
    projectId?: ProjectId;
  }): IntegrationBinding | null;
  connectLinear(params: {
    workspaceId: WorkspaceId;
    token: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<LinearViewer>;
  connectSentry(params: {
    workspaceId: WorkspaceId;
    token: string | null;
    org: string | null;
    project: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<SentryProject>;
  connectGitlab(params: {
    workspaceId: WorkspaceId;
    host: string;
    token: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<GitlabUser>;
  connectJira(params: {
    workspaceId: WorkspaceId;
    siteUrl: string;
    email: string;
    projectKey: string;
    apiToken: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<JiraUser>;
  connectBitbucket(params: {
    workspaceId: WorkspaceId;
    workspaceSlug: string;
    email: string;
    apiToken: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<BitbucketConnection>;
  connectSlack(params: {
    workspaceId: WorkspaceId;
    botToken: string | null;
    credentialId: IntegrationCredentialId | null;
  }): Promise<SlackConnection>;
  disconnectGithub(params: { workspaceId: WorkspaceId }): Promise<void>;
  createSession(input: {
    workspaceId: WorkspaceId;
    projectId?: ProjectId;
    goal: string;
    branchPrefix?: string;
    branchSlug?: string;
    existingBranch?: string;
    fallbackRef?: string;
    folderName?: string;
    providerPreference?: SessionProviderPreference;
    workflowId?: WorkflowId;
    autoRun?: boolean;
    firstAgentKind?: AgentKind;
    firstAgentModel?: string;
    kickoffPrompt?: string;
    externalTasks?: ReadonlyArray<{
      provider: SessionExternalTaskProvider;
      projectId?: ProjectId;
      externalId: string;
      identifier: string;
      url: string;
      title: string;
    }>;
    mobileShared?: boolean;
    omitGoalSlot?: boolean;
  }): Promise<{ session: Session }>;
  createUntitledSession(input: { workspaceId: WorkspaceId }): Promise<{ session: Session }>;
  clearPendingTitleFocus(): void;
  materializeProject(input: {
    sessionId: SessionId;
    projectId: ProjectId;
    reason: string;
    taskIdentifiers?: ReadonlyArray<string>;
  }): Promise<SessionProjectMount>;
  detachProject(input: { sessionId: SessionId; projectId: ProjectId }): Promise<void>;
  loadSessionMounts(input: SessionKeyInput): Promise<ReadonlyArray<SessionMountView>>;
  forkMount(input: ForkMountInput): Promise<SessionMountView>;
  switchMount(input: SwitchMountInput): Promise<SessionMountView>;
  attachMount(input: AttachMountInput): Promise<SessionMountView>;
  unmountMount(input: UnmountMountInput): Promise<UnmountMountResult>;
  inspectMount(input: MountKeyInput): Promise<InspectMountResult>;
  recoverMountOperations(input: SessionKeyInput): Promise<number>;
  resolveMountBranchMismatch(input: ResolveMountBranchInput): Promise<SessionMountView>;
  setSessionActiveMount(input: MountKeyInput): Promise<void>;
  openMountRequest(input: OpenMountRequestInput): Promise<void>;
  cleanupSessionMounts(
    input: CleanupSessionMountsInput,
  ): Promise<ReadonlyArray<SessionCleanupOutcome>>;
  proposeMountCleanup(input: ProposeMountCleanupInput): Promise<MountCleanupProposal | null>;
  loadMountCleanupProposals(
    input: SessionCleanupKeyInput,
  ): Promise<ReadonlyArray<MountCleanupProposal>>;
  resolveMountCleanup(input: ResolveMountCleanupInput): Promise<void>;
  createPrSeries(input: CreatePrSeriesInput): Promise<PrSeries>;
  setPrSeriesMember(input: SetPrSeriesMemberInput): Promise<PrSeriesMember>;
  loadPrSeries(input: LoadPrSeriesInput): Promise<ReadonlyArray<PrSeriesView>>;
  linkSessionExternalTask(
    sessionId: SessionId,
    task: Omit<SessionExternalTask, 'sessionId'>,
  ): Promise<void>;
  unlinkSessionExternalTask(
    sessionId: SessionId,
    provider: SessionExternalTaskProvider,
    externalId: string,
    projectId?: ProjectId,
  ): Promise<void>;
  changeSessionBranch(
    sessionId: SessionId,
    args: { branch: string; createNew: boolean },
  ): Promise<void>;
  setSessionActiveProject(input: {
    sessionId: SessionId;
    projectId: ProjectId;
    mountId?: MountId;
  }): Promise<void>;
  reconcileSessionBranch(sessionId: SessionId, observedBranch: string): Promise<void>;
  amendSessionCommit(
    sessionId: SessionId,
    args: { sha: string; message: string },
  ): Promise<RewrittenHead>;
  squashSessionCommits(
    sessionId: SessionId,
    args: { sha: string; message: string },
  ): Promise<RewrittenHead>;
  setWorkflowRunAutoRun(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    autoRun: boolean,
  ): Promise<void>;
  stopWorkflowRunNow(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  startWorkflowRun(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  attachWorkflowToSession(
    sessionId: SessionId,
    workflowId: WorkflowId,
    options?: {
      autoRun?: boolean;
      goal?: string;
      triggerMode?: WorkflowTriggerMode;
      chainAfterId?: WorkflowRunId;
      attachmentInputs?: ReadonlyArray<AttachmentInput>;
      executionMode?: WorkflowExecutionMode;
      orchestratorRouting?: OrchestratorRouting;
      spendLimitUsd?: number;
      spendLimitMode?: WorkflowSpendLimitMode;
      navigate?: boolean;
    },
  ): Promise<void>;
  detachWorkflowFromSession(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  discardWorkflow(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  restoreWorkflow(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  reorderSessionWorkflows(
    sessionId: SessionId,
    workflowRunIds: ReadonlyArray<WorkflowRunId>,
  ): Promise<void>;
  activateWorkflowAgent(params: ActivateWorkflowAgentParams): Promise<void>;
  advanceClusterImplementation(
    sessionId: SessionId,
    childAgentId: AgentId,
    assistantText: string,
    opts?: { readonly force?: boolean },
  ): Promise<void>;
  finalizeWorkflowStep(
    sessionId: SessionId,
    agentId: AgentId,
    assistantText: string,
    planCapturedThisTurn: boolean,
    opts?: { readonly force?: boolean },
  ): Promise<{ readonly shouldAutoAdvance: boolean }>;
  advanceScoutTree(sessionId: SessionId, agentId: AgentId, assistantText: string): Promise<void>;
  skipStuckStepAndAdvance(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    options?: { readonly onlyWhenBlocked?: boolean },
  ): Promise<void>;
  recoverStuckStep(params: {
    readonly sessionId: SessionId;
    readonly workflowRunId: WorkflowRunId;
  }): Promise<void>;
  maybeAutoAdvanceWorkflow(sessionId: SessionId): Promise<void>;
  orchestrateNextStep(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    options?: OrchestrateOptions,
  ): Promise<void>;
  retryWorkflowOrchestration(sessionId: SessionId, workflowRunId: WorkflowRunId): Promise<void>;
  continueWorkflowRun(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    note?: string,
  ): Promise<void>;
  setWorkflowOrchestratorHints(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    hints: string,
  ): Promise<void>;
  setWorkflowOrchestratorRouting(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    routing: OrchestratorRouting | null,
  ): Promise<void>;
  setWorkflowRoleModelOverrides(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    overrides: RoleModelPreferences,
  ): Promise<void>;
  setWorkflowRunSpendLimit(
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    limitUsd: number | null,
    mode: WorkflowSpendLimitMode,
  ): Promise<void>;
  reprocessGoalForWorkflow(sessionId: SessionId): Promise<void>;
  loadTranscript(agentId: AgentId, sessionId: SessionId): Promise<void>;
  appendTurnEvent(agentId: AgentId, sessionId: SessionId, event: TurnEvent): void;
  resetTranscript(agentId: AgentId): void;
  sendTurn(input: {
    sessionId: SessionId;
    agentId?: AgentId;
    content: string;
    attachments?: ReadonlyArray<AttachmentInput>;
    override?: TurnProviderOverride;
    force?: boolean;
    origin?: 'operator';
  }): Promise<SendTurnResult>;
  cancelCurrentTurn(sessionId: SessionId, agentId?: AgentId): Promise<void>;
  retrySummarizer(sessionId: SessionId, taskModelOverride?: TaskModelPreference): void;
  refreshWorkspaceSummary(workspaceId: WorkspaceId): Promise<void>;
  loadSessionTelemetry(sessionId: SessionId): Promise<void>;
  loadSessionSlots(sessionId: SessionId): Promise<void>;
  ensureSessionSlots(sessionId: SessionId): Promise<void>;
  upsertSessionSlot(sessionId: SessionId, key: SlotKey, value: string): Promise<void>;
  loadSlotHistory(sessionId: SessionId, key: SlotKey): Promise<void>;
  toggleSessionSlot(sessionId: SessionId, key: SlotKey, enabled: boolean): Promise<void>;
  loadStorageStats(): Promise<void>;
  pruneArchivedTranscripts(): Promise<number>;
  removeArchivedWorktrees(): Promise<{ removed: number; failed: number }>;
  loadBudgetRules(): Promise<void>;
  saveBudgetRule(rule: Omit<BudgetRule, 'id' | 'createdAt'>): Promise<void>;
  deleteBudgetRule(id: string): Promise<void>;
  loadSessionBudget(sessionId: SessionId): Promise<void>;
  setSessionBudget(sessionId: SessionId, softCapUsd: number): Promise<void>;
  refreshProviderSpendBreakdown(workspaceId: WorkspaceId): Promise<void>;
  loadBudgetAlerts(): Promise<void>;
  dismissBudgetAlert(id: string): Promise<void>;
  loadSkills(workspaceId: WorkspaceId): Promise<void>;
  saveSkill(input: SkillUpsertArgs): Promise<void>;
  deleteSkill(skillId: SkillId, workspaceId: WorkspaceId): Promise<void>;
  rescanSkills(workspaceId: WorkspaceId): Promise<void>;
  loadScripts(workspaceId: WorkspaceId): Promise<void>;
  saveScript(input: SaveScriptParams): Promise<void>;
  deleteScript(scriptId: ProjectScriptId, workspaceId: WorkspaceId): Promise<void>;
  loadDiscoveredScripts(input: DiscoveredScriptsParams): Promise<void>;
  refreshDiscoveredScripts(input: DiscoveredScriptsParams): Promise<void>;
  runScript(input: RunScriptParams): Promise<ScriptRunResult>;
  runDiscoveredScript(input: RunDiscoveredScriptParams): Promise<ScriptRunResult>;
  reattachScriptRuns(): Promise<void>;
  cancelScript(sessionId: SessionId, scriptId: string): Promise<void>;
  loadPhaseTemplates(workspaceId: WorkspaceId): Promise<void>;
  copyWorkflowFromWorkspace(params: CopyWorkflowFromWorkspaceParams): Promise<Workflow>;
  savePhaseTemplate(template: WorkflowUpsertArgs): Promise<Workflow>;
  deleteWorkflow(id: WorkflowId, workspaceId: WorkspaceId): Promise<void>;
  renameWorkflow(workspaceId: WorkspaceId, workflowId: WorkflowId, name: string): Promise<void>;
  makeWorkflowPreset(workspaceId: WorkspaceId, workflowId: WorkflowId): Promise<void>;
  generateWorkflowTitle(
    workspaceId: WorkspaceId,
    workflowId: WorkflowId,
    sessionId: SessionId,
    fallbackName: string,
    goal: string,
    process: string,
  ): Promise<void>;
  loadStepLibrary(workspaceId: WorkspaceId): Promise<void>;
  saveStepDef(args: StepDefUpsertArgs, listWorkspaceId: WorkspaceId): Promise<void>;
  deleteStepDef(id: StepDefId, listWorkspaceId: WorkspaceId): Promise<void>;
  resetWorkflows(workspaceId: WorkspaceId): Promise<void>;
  loadPhaseRunsForSession(sessionId: SessionId): Promise<void>;
  selectAgent(sessionId: SessionId, agentId: AgentId): Promise<void>;
  deselectAgent(sessionId: SessionId): void;
  markAgentViewed(sessionId: SessionId, agentId: AgentId): Promise<void>;
  markAgentSeen(sessionId: SessionId, agentId: AgentId): Promise<void>;
  markAllAgentsSeen(sessionId: SessionId): Promise<void>;
  setAgentDone(sessionId: SessionId, agentId: AgentId): Promise<void>;
  clearAgentDone(sessionId: SessionId, agentId: AgentId): Promise<void>;
  spawnAgent(
    sessionId: SessionId,
    args: {
      stepId?: StepId;
      workflowRunId?: WorkflowRunId;
      name?: string;
      model?: string;
      provider?: ProviderId;
      effort?: string;
      initialPrompt?: string;
      triggeredPlanId?: PlanId;
      kindOverride?: AgentKind;
      sourceThreadId?: string;
      sourceThreadIds?: ReadonlyArray<string>;
      sourceCommentUrl?: string;
      sourceKind?: AgentSourceKind;
      focus?: SpawnFocus;
      parentAgentId?: AgentId;
    },
  ): Promise<AgentId>;
  forceCloseResolver(sessionId: SessionId, agentId: AgentId): Promise<void>;
  setResolverThreadReply(params: { agentId: AgentId; threadId: string; reply: string }): void;
  renameAgent(sessionId: SessionId, agentId: AgentId, name: string): Promise<void>;
  setAgentKind(agentId: AgentId, kind: AgentKind): void;
  setAgentEffortOverride(agentId: AgentId, effort: string): void;
  setAgentDraft(agentId: AgentId, value: string): void;
  clearAgentDraft(agentId: AgentId): void;
  setWorkflowDraft(sessionId: SessionId, draft: WorkflowBuilderDraft): void;
  clearWorkflowDraft(sessionId: SessionId): void;
  setWorkflowStudioDraft(params: { workspaceId: WorkspaceId; draft: WorkflowStudioDraft }): void;
  clearWorkflowStudioDraft(params: { workspaceId: WorkspaceId }): void;
  setWorkflowStudioVisible(params: { workspaceId: WorkspaceId | null }): void;
  startWorkflowGeneration(params: StartWorkflowGenerationParams): Promise<boolean>;
  consumeWorkflowGeneration(params: { workspaceId: WorkspaceId }): void;
  undoWorkflowGeneration(params: { workspaceId: WorkspaceId }): Promise<void>;
  setAgentAttachments(agentId: AgentId, attachments: ReadonlyArray<DraftAttachment>): void;
  clearAgentAttachments(agentId: AgentId): void;
  setAgentQueue(agentId: AgentId, queue: ReadonlyArray<AgentQueuedTurn>): void;
  clearAgentQueue(agentId: AgentId): void;
  deleteAgent(sessionId: SessionId, agentId: AgentId): Promise<void>;
  wipeLocalDatabase(): Promise<void>;
  loadWorkspaceOverrides(workspaceId: WorkspaceId): Promise<void>;
  setWorkspaceOverrides(workspaceId: WorkspaceId, overrides: OverrideSettings): Promise<void>;
  setWorkspaceProviderBinding(
    workspaceId: WorkspaceId,
    providerId: ProviderId,
    credentialId: string | null,
  ): Promise<void>;
  loadSessionOverrides(sessionId: SessionId): Promise<void>;
  setTaskOverrides(sessionId: SessionId, overrides: OverrideSettings): Promise<void>;
  loadCredentials(): Promise<void>;
  createCredential(
    providerId: ProviderId,
    label: string,
    apiKey: string,
  ): Promise<ProviderCredential>;
  deleteCredential(id: CredentialId): Promise<void>;
  renameCredential(id: CredentialId, label: string): Promise<void>;
  setAgentVerbosity(sessionId: SessionId, agentId: AgentId, level: VerbosityLevel): Promise<void>;
  renameTask(sessionId: SessionId, goal: string): Promise<void>;
  autoTitleSession(sessionId: SessionId, title: string): Promise<void>;
  deleteTask(sessionId: SessionId): Promise<void>;
  bulkDeleteTask(ids: ReadonlyArray<SessionId>): Promise<void>;
  archiveTask(sessionId: SessionId, options?: ArchiveTaskOptions): Promise<void>;
  bulkArchiveTask(ids: ReadonlyArray<SessionId>): Promise<void>;
  unarchiveTask(sessionId: SessionId): Promise<void>;
  bulkUnarchiveTask(ids: ReadonlyArray<SessionId>): Promise<void>;
  setSessionConfig(sessionId: SessionId, fields: SessionConfigUpdate): Promise<void>;
  setAgentConfig(sessionId: SessionId, agentId: AgentId, fields: AgentConfigUpdate): Promise<void>;
  refreshUnreadWorkspaces(): Promise<void>;
  setPanelSectionExpanded(sessionId: SessionId, section: PanelSection, expanded: boolean): void;
  exportConfig(): Promise<string | null>;
  importConfig(): Promise<import('@goodboy/types').ConfigBundleImportResult | null>;
  refreshGithubStatus(): Promise<void>;
  setGithubPat(token: string): Promise<GhTokenStatus>;
  clearGithubToken(): Promise<void>;
  refreshSessionPr(sessionId: SessionId, opts?: RefreshPrOptions): Promise<void>;
  refreshSessionPrDetail(
    sessionId: SessionId,
    opts?: { mountId?: MountId; force?: boolean; silent?: boolean; retries?: number },
  ): Promise<void>;
  selectSessionPr(sessionId: SessionId, prNumber: number, mountId?: MountId): Promise<void>;
  sweepGithub(opts?: { skipUnknownPr?: boolean }): void;
  resolveGithubThread(
    sessionId: SessionId,
    threadId: string,
    closure?: { commitSha?: string; reason?: string; reply?: string },
  ): Promise<boolean>;
  resolveAgentThreads(sessionId: SessionId, agentId: AgentId): Promise<boolean>;
  queueResolution(
    sessionId: SessionId,
    args: {
      threadId: string;
      commitSha: string;
      prNumber: number;
      reply?: string | null;
      outcome?: PendingResolutionOutcome | null;
    },
  ): Promise<void>;
  dequeueResolution(sessionId: SessionId, threadId: string): Promise<void>;
  loadPendingResolutions(sessionId: SessionId): Promise<void>;
  pushAllResolutions(
    sessionId: SessionId,
  ): Promise<{ pushed: boolean; resolved: number; failed: number }>;
  pushSessionBranch(
    sessionId: SessionId,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }>;
  createPrForSession(input: CreatePrInput): Promise<void>;
  markPrReady(sessionId: SessionId, prNumber?: number): Promise<void>;
  convertPrToDraft(sessionId: SessionId, prNumber?: number): Promise<void>;
  mergePr(sessionId: SessionId, prNumber?: number, method?: PrMergeMethod): Promise<void>;
  refreshSessionMr(sessionId: SessionId, opts?: RefreshMrOptions): Promise<void>;
  refreshReviewPrs(workspaceId: WorkspaceId): Promise<void>;
  startPrReviewSession(workspaceId: WorkspaceId, pr: ReviewablePr): Promise<SessionId>;
  loadReviewDrafts(sessionId: SessionId): Promise<void>;
  addReviewDraft(input: AddReviewDraftInput): Promise<PrReviewDraft>;
  updateReviewDraft(id: string, body: string): Promise<void>;
  discardReviewDraft(id: string): Promise<void>;
  queueAgentReviewComments(
    sessionId: SessionId,
    agentId: AgentId,
    markers: ReadonlyArray<ExtractedReviewComment>,
  ): Promise<void>;
  publishPrReview(sessionId: SessionId, opts: PublishPrReviewOpts): Promise<PublishPrReviewResult>;
  createMrForSession(input: CreateMrInput): Promise<void>;
  mergeMrForSession(input: MergeMrInput): Promise<void>;
  refreshSessionBitbucketPr(
    sessionId: SessionId,
    opts?: RefreshSessionBitbucketPrOptions,
  ): Promise<void>;
  selectSessionBitbucketPr(
    sessionId: SessionId,
    pullRequestId: number | null,
    mountId?: MountId,
  ): Promise<void>;
  approveBitbucketPr(params: BitbucketPrWriteParams): Promise<void>;
  unapproveBitbucketPr(params: BitbucketPrWriteParams): Promise<void>;
  requestBitbucketPrChanges(params: BitbucketPrWriteParams): Promise<void>;
  withdrawBitbucketPrChanges(params: BitbucketPrWriteParams): Promise<void>;
  mergeBitbucketPr(params: BitbucketPrWriteParams): Promise<void>;
  declineBitbucketPr(params: BitbucketPrWriteParams): Promise<void>;
  commentOnBitbucketPr(params: BitbucketPrCommentParams): Promise<void>;
  replyToBitbucketPrComment(params: BitbucketPrReplyParams): Promise<void>;
  refreshSlackChannels(params: SlackWorkspaceParams): Promise<void>;
  refreshSlackUsers(params: SlackWorkspaceParams): Promise<void>;
  refreshSlackThreadHeads(params: SlackChannelParams): Promise<void>;
  refreshSlackThread(params: SlackThreadParams, options?: RefreshSlackThreadOptions): Promise<void>;
  replyToSlackThread(params: SlackReplyParams): Promise<void>;
  addSlackReaction(params: SlackReactionParams): Promise<void>;
  closePr(sessionId: SessionId, prNumber?: number): Promise<void>;
  reopenPr(sessionId: SessionId, prNumber?: number): Promise<void>;
  editPr(
    sessionId: SessionId,
    prNumber: number,
    opts: { title?: string; body?: string },
  ): Promise<void>;
  requestReview(
    sessionId: SessionId,
    prNumber: number,
    reviewers: ReadonlyArray<string>,
  ): Promise<void>;
  resolvePermissionRequest(input: {
    sessionId: SessionId;
    agentId: AgentId;
    toolUseId: string;
    toolName: string;
    runId: ProviderRunId;
    scope: PermissionScope;
  }): Promise<void>;
  retryBlockedTool(input: {
    sessionId: SessionId;
    agentId: AgentId;
    toolName: string;
  }): Promise<void>;
  setSessionPermissionMode(sessionId: SessionId, mode: ClaudePermissionMode): Promise<void>;
  loadDiffComments(sessionId: SessionId): Promise<void>;
  addDiffComment(
    sessionId: SessionId,
    filePath: string,
    body: string,
    anchor?: import('@goodboy/types').DiffCommentAnchor,
  ): Promise<void>;
  resolveDiffComment(sessionId: SessionId, commentId: string): Promise<void>;
  consumeDiffComments(
    sessionId: SessionId,
    commentIds: ReadonlyArray<string>,
    agentId: AgentId,
  ): Promise<void>;
  reopenDiffComment(sessionId: SessionId, commentId: string): Promise<void>;
  deleteDiffComment(sessionId: SessionId, commentId: string): Promise<void>;
  loadSessionEvents(params: { sessionId: SessionId; force?: boolean }): Promise<void>;
  recordSessionEvent(params: {
    sessionId: SessionId;
    kind: SessionEventKind;
    payload?: SessionEventPayload;
  }): Promise<void>;
  recordSessionEventOnce(params: {
    sessionId: SessionId;
    kind: SessionEventKind;
    payload?: SessionEventPayload;
  }): Promise<void>;
  loadSessionFileVersions(params: { sessionId: SessionId; force?: boolean }): Promise<void>;
  selectSessionFileVersionPath(params: { sessionId: SessionId; relativePath: string | null }): void;
  restoreSessionFileVersion(params: {
    sessionId: SessionId;
    versionId: FileVersionId;
    sessionDir: string;
  }): Promise<void>;
  deleteSessionFileVersion(params: {
    sessionId: SessionId;
    versionId: FileVersionId;
  }): Promise<void>;
  deleteAllSessionFileVersions(params: { sessionId: SessionId }): Promise<void>;
  loadGoalAttachments(owner: GoalAttachmentOwner): Promise<void>;
  addGoalAttachments(
    owner: GoalAttachmentOwner,
    inputs: ReadonlyArray<AttachmentInput>,
  ): Promise<void>;
  removeGoalAttachment(owner: GoalAttachmentOwner, id: string): Promise<void>;
  loadNotifications(): Promise<void>;
  emitNotification(
    kind: NotificationKind,
    severity: NotificationSeverity,
    title: string,
    body?: string,
    opts?: {
      sessionId?: SessionId;
      workspaceId?: WorkspaceId;
      action?: NotificationAction;
      coalesceKey?: string;
    },
  ): Promise<void>;
  retryStepSummary(params: {
    sessionId: SessionId;
    agentId: AgentId;
    taskModelOverride?: TaskModelPreference;
  }): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  markNotificationsRead(): Promise<void>;
  dismissNotification(id: string): Promise<void>;
  clearNotifications(): Promise<void>;
  loadSessionOpenQuestions(sessionId: SessionId): Promise<void>;
  loadSessionAnsweredQuestions(sessionId: SessionId): Promise<void>;
  loadSessionDismissedQuestions(sessionId: SessionId): Promise<void>;
  requestOpenQuestionScroll(target: { agentId: AgentId; questionId: OpenQuestionId }): void;
  clearOpenQuestionScroll(): void;
  answerOpenQuestions(
    sessionId: SessionId,
    pairs: ReadonlyArray<{ id: OpenQuestionId; text: string; answer: string }>,
    targetAgentId: AgentId | null,
  ): Promise<void>;
  dismissOpenQuestion(sessionId: SessionId, question: OpenQuestion): Promise<void>;
  restoreDismissedOpenQuestion(sessionId: SessionId, question: OpenQuestion): Promise<void>;
  loadSessionPlans(sessionId: SessionId): Promise<void>;
  setPlanStatus(sessionId: SessionId, planId: PlanId, status: PlanStatus): Promise<void>;
  updatePlanBody(
    sessionId: SessionId,
    planId: PlanId,
    title: string,
    bodyMd: string,
  ): Promise<void>;
  deletePlan(sessionId: SessionId, planId: PlanId): Promise<void>;
  restorePlan(sessionId: SessionId, planId: PlanId): Promise<void>;
  loadConsumptionsForPlan(planId: PlanId): Promise<void>;
  runPlan(sessionId: SessionId, planId: PlanId): Promise<AgentId | null>;
  dismissSessionNudge(sessionId: SessionId, outcome?: 'accepted' | 'dismissed'): Promise<void>;
  acceptSessionNudgeHandoff(sessionId: SessionId): Promise<AgentId | null>;
  setScriptsLensScope(params: { readonly scope: { readonly projectId: ProjectId } | null }): void;
  setReviewLensIntent(params: {
    readonly intent: { readonly sessionId: SessionId; readonly agentId: AgentId } | null;
  }): void;
  getSessionViewPrefs(workspaceId: WorkspaceId): SessionViewPrefs;
  setSessionSort(workspaceId: WorkspaceId, sort: SessionSortKey): void;
  setSessionGroup(workspaceId: WorkspaceId, group: SessionGroupKey): void;
  setActiveLens(sessionId: SessionId, lens: LensKind | null): void;
  lensGo(sessionId: SessionId, delta: number): void;
  toggleWorkflowExpand(sessionId: SessionId, runId: string, defaultExpanded: boolean): void;
  setFocusedWorkflowRun(sessionId: SessionId, runId: string | null): void;
  setSessionStudio(sessionId: SessionId, studio: SessionStudio | null): void;
  setFocusedPlanId(sessionId: SessionId, planId: PlanId | null): void;
  setFocusedGithubIssueNumber(sessionId: SessionId, issueNumber: number | null): void;
  setDiffFocus(sessionId: SessionId, focus: DiffFocus | null): void;
  openDiffLens(sessionId: SessionId, focus: DiffFocus | null): void;
  openMountDiff(sessionId: SessionId, worktreePath: string): void;
  openExternalTaskLens(sessionId: SessionId, task: SessionExternalTask): void;
  beginSessionCreation(
    sessionId: SessionId,
    creation: { readonly kind: SessionCreationKind; readonly label?: string | null },
  ): SessionCreationId;
  endSessionCreation(sessionId: SessionId, creationId: SessionCreationId): void;
  openTerminal(sessionId: SessionId, cwd: string | null, cols: number, rows: number): Promise<void>;
  closeTerminal(sessionId: SessionId): Promise<void>;
  addTerminalTab(sessionId: SessionId, cwd: string | null): TerminalTabId;
  reattachTerminalTabs(): Promise<void>;
  closeTerminalTab(sessionId: SessionId, tabId: TerminalTabId): void;
  setActiveTerminalTab(sessionId: SessionId, tabId: TerminalTabId): void;
  setTerminalTabStatus(sessionId: SessionId, tabId: TerminalTabId, status: TerminalTabStatus): void;
  closeSessionTerminals(sessionId: SessionId): Promise<void>;
  reconcileOrphanWorktrees(): Promise<void>;
  removeOrphanWorktrees(params: {
    workspaceId: WorkspaceId;
    paths: ReadonlyArray<string>;
  }): Promise<void>;
};

export type AppStore = AppState & AppActions & ReturnType<typeof createResolveSlice>;

export const initialState: AppState = {
  ...initialUpdaterState,
  ...initialChangelogState,
  ...initialBugReportDraftState,
  ...initialScriptsState,
  ...createInitialSessionViewState({}),
  selectedProjectIds: {},
  workspaces: [],
  projects: [],
  workspaceIntegrations: {},
  integrationCredentials: [],
  integrationCredentialUsage: {},
  projectGitStatus: {},
  projectCheckoutPulling: {},
  sessionExternalTasks: {},
  sessionEvents: {},
  currentWorkspaceId: null,
  windowPresence: {},
  sessions: [],
  archivedSessions: {},
  currentSessionId: null,
  pendingTitleFocusSessionId: null,
  settings: {},
  sessionSummary: null,
  providerStatus: null,
  cursorStatus: null,
  codexStatus: null,
  geminiStatus: null,
  authResults: null,
  providers: buildProviderList({
    anthropic: null,
    cursor: null,
    codex: null,
    gemini: null,
    opencode: null,
    openrouter: null,
    moonshot: null,
  }),
  providerLifecycle: INITIAL_LIFECYCLE_MAP,
  providerConnect: INITIAL_CONNECT_MAP,
  providerCredentials: [],
  providerCooldowns: {},
  hydrated: false,
  bootPhase: 'pending',
  error: null,
  transcripts: {},
  messages: {},
  sessionWorktrees: {},
  sessionWorktreeRecords: {},
  orphanWorktrees: {},
  sessionProjectMounts: {},
  ...projectMountsInitialState,
  ...mountCleanupInitialState,
  ...prSeriesInitialState,
  sessionLanguageAnchor: {},
  sessionActiveProject: {},
  sessionBranches: {},
  sessionTelemetry: {},
  workspaceSummary: null,
  sessionSlots: {},
  slotHistory: {},
  slotHistoryCounts: {},
  sessionSlotsLoad: {},
  summarizerStatus: {},
  storageStats: null,
  storageStatsLoading: false,
  budgetRules: [],
  sessionBudgets: {},
  providerSpendBreakdown: [],
  budgetAlerts: [],
  skills: {},
  phaseTemplates: {},
  stepLibrary: {},
  sessionWorkflows: {},
  sessionPhaseRuns: {},
  orchestratingWorkflowRuns: {},
  pendingOrchestrations: {},
  pendingAdvanceSessions: new Set<SessionId>(),
  announcedWorkflowBlocks: {},
  announcedRunBudget: {},
  selectedAgentId: {},
  agentRunHistory: {},
  agentTurnState: {},
  clusterStartAttempts: {},
  unknownPayloadCounts: {},
  detectedEditors: [],
  workspaceOverrides: {},
  sessionOverrides: {},
  unreadWorkspaceIds: new Set<WorkspaceId>(),
  sessionPanelExpanded: {},
  githubStatus: null,
  mountGithub: {},
  mountSelectedPr: {},
  sessionGithub: {},
  sessionProjectPrs: {},
  sessionSelectedPrNumber: {},
  ...initialGitlabMrState,
  ...initialBitbucketPrState,
  ...initialSlackThreadsState,
  reviewPrs: {},
  reviewDrafts: {},
  sessionPendingResolutions: {},
  sessionResolvedThreads: {},
  volatilePermissionAllows: new Set<string>(),
  agentModelOverride: {},
  agentProviderOverride: {},
  agentEffortOverride: {},
  agentKindOverride: {},
  ...resolveInitialState,
  resolverState: {},
  resolverThreadOutcomes: {},
  agentDraft: {},
  workflowDrafts: {},
  ...initialWorkflowStudioState,
  agentAttachments: {},
  agentQueue: {},
  diffComments: {},
  sessionFileVersions: {},
  sessionFileVersionsLoading: {},
  sessionFileVersionSelectedPath: {},
  sessionAttachments: {},
  workflowRunAttachments: {},
  notifications: [],
  notificationsLoading: false,
  notificationCounts: { total: 0, unread: 0 },
  sessionPlans: {},
  sessionNudges: {},
  planConsumptions: {},
  sessionOpenQuestions: {},
  sessionAnsweredQuestions: {},
  sessionDismissedQuestions: {},
  openQuestionScrollTarget: null,
  sessionLoading: {},
  boardReady: true,
  terminalSessions: {},
  terminalTabs: {},
  activeTerminalTab: {},
};

export { summarizerQueues } from './turn-helpers';

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,
  ...createNotificationsSlice(set, get),
  ...createNudgesSlice(set, get),
  ...createPlansSlice(set, get),
  ...createOpenQuestionsSlice(set, get),
  ...createBudgetSlice(set, get),
  ...createSkillsSlice(set, get),
  ...createStorageSlice(set, get),
  ...createDiffCommentsSlice(set, get),
  ...createFileVersionsSlice(set, get),
  ...createSessionEventsSlice(set, get),
  ...createAttachmentsSlice(set, get),
  ...createGithubSlice(set, get),
  ...createGitlabMrSlice(set, get),
  ...createBitbucketPrSlice(set, get),
  ...createSlackThreadsSlice(set, get),
  ...createReviewPrsSlice(set, get),
  ...createReviewDraftsSlice(set, get),
  ...createIntegrationsSlice(set, get),
  ...createSidebarSlice(set, get),
  ...createSessionViewSlice(set, get),
  ...createSessionFiltersSlice({ set, get }),
  ...createTerminalSlice(set, get),
  ...createScriptsSlice(set, get),
  ...createPermissionsSlice(set, get),
  ...createProvidersSlice(set, get),
  ...createAgentsSlice(set, get),
  ...createResolveSlice({ set, get }),
  ...createWorkflowDraftsSlice(set, get),
  ...createWorkflowStudioSlice(set, get),
  ...createSlotsSlice(set, get),
  ...createOverridesSlice(set, get),
  ...createCredentialsSlice(set, get),
  ...createWorkflowsSlice(set, get),
  ...createSettingsSlice(set, get),
  ...createTranscriptsSlice(set, get),
  ...createSummariesSlice(set, get),
  ...createSessionsSlice(set, get),
  ...createWorkspacesSlice(set, get),
  ...createProjectsSlice(set, get),
  ...createProjectMountsSlice(set, get),
  ...createMountCleanupSlice(set, get),
  ...createPrSeriesSlice(set, get),
  ...createPresenceSlice(set, get),
  ...createTurnSlice(set, get),
  ...createWorktreesSlice(set, get),
  ...createBootSlice(set, get),
  ...createUpdaterSlice(set, get),
  ...createChangelogSlice(set, get),
  ...createBugReportDraftSlice(set, get),
}));
