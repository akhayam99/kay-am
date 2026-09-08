import type {
  IntegrationCredentialId,
  IsoDateTime,
  ProjectId,
  ProjectScriptId,
  ProviderRunId,
  SessionId,
  WorkflowId,
  WorkflowRunId,
  WorkspaceId,
  IntegrationBindingId,
  MountId,
} from './ids';
import type { SessionProviderPreference } from './provider-preference';
import type { ModelEffort, ProviderId } from './provider-registry';
import type { ClaudePermissionMode } from './permission';
import type { OverrideSettings, RoleModelPreferences } from './settings';
import type { GitDistance, GitOperation, GitWorkingTree } from './worktree';

export type WorkspaceGitState = 'missing' | 'absent' | 'unborn' | 'ready';

export type WorkspaceGitStatus = Readonly<{
  state: WorkspaceGitState;
  branch: string | null;
  headSubject: string | null;
  upstreamDistance: GitDistance;
  workingTree: GitWorkingTree;
  upstream: string | null;
  inProgress: GitOperation | null;
}>;

export type WorkspaceProfile = Readonly<{
  bio: string | null;
}>;

export type Project = Readonly<{
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  rootPath: string;
  kind: 'repo' | 'folder';
  baseBranch?: string | null;
  overrides: OverrideSettings;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  disconnectedAt?: IsoDateTime;
  lastAccessedAt?: IsoDateTime;
}>;

export type SessionProjectMount = Readonly<{
  mountId?: MountId;
  projectId: ProjectId;
  mountName: string;
  worktreePath: string;
  repoRoot: string;
  branch: string;
}>;

export type Workspace = Readonly<{
  id: WorkspaceId;
  name: string;
  slug: string;
  sessionsRoot: string | null;
  profile?: WorkspaceProfile;
  overrides: OverrideSettings;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt?: IsoDateTime;
  disconnectedAt?: IsoDateTime;
  lastAccessedAt?: IsoDateTime;
}>;

export type ContextSlot = Readonly<{
  key: string;
  value: string;
  enabled: boolean;
}>;

export type ContextSlotAuthor = 'user' | 'summarizer';

export type ContextSlotHistoryEntry = Readonly<{
  id: string;
  key: string;
  value: string;
  author: ContextSlotAuthor;
  createdAt: IsoDateTime;
}>;

export type TurnState =
  | { kind: 'draft' }
  | { kind: 'starting'; startedAt: IsoDateTime }
  | { kind: 'idle'; lastActivityAt: IsoDateTime }
  | { kind: 'running'; runId: ProviderRunId; startedAt: IsoDateTime }
  | { kind: 'blocked'; runId: ProviderRunId; blockedAt: IsoDateTime }
  | { kind: 'error'; message: string; failedAt: IsoDateTime }
  | { kind: 'ended'; endedAt: IsoDateTime };

export type WorkflowTriggerMode = 'immediate' | 'manual' | 'after_run';

export type WorkflowExecutionMode = 'static' | 'dynamic';

export type WorkflowOrchestrationOutcome = 'done' | 'blocked';

export type WorkflowOrchestrationStopKind = 'failure' | 'budget' | 'questions' | 'operator';

export type WorkflowOrchestrationStop = Readonly<{
  kind: WorkflowOrchestrationStopKind;
  message: string;
}>;

export type WorkflowSpendLimitMode = 'notify' | 'pause';

export type OrchestratorRouting = Readonly<{
  providerId: ProviderId;
  model: string;
  effort?: ModelEffort;
}>;

export type WorkflowRun = Readonly<{
  id: WorkflowRunId;
  workflowId: WorkflowId;
  ordinal: number;
  currentStep: number;
  autoRun: boolean;
  triggerMode: WorkflowTriggerMode;
  executionMode: WorkflowExecutionMode;
  orchestrationOutcome?: WorkflowOrchestrationOutcome;
  orchestrationReason?: string;
  orchestrationStop?: WorkflowOrchestrationStop;
  orchestratorHints?: string;
  orchestratorSummary?: string;
  orchestratorRouting?: OrchestratorRouting;
  roleModelOverrides?: RoleModelPreferences;
  spendLimitUsd?: number;
  spendLimitMode?: WorkflowSpendLimitMode;
  chainAfterId?: WorkflowRunId;
  goal?: string;
  discardedAt?: IsoDateTime;
  createdAt?: IsoDateTime;
}>;

export type Session = Readonly<{
  id: SessionId;
  workspaceId: WorkspaceId;
  goal: string;
  state: TurnState;
  contextSlots: ReadonlyArray<ContextSlot>;
  providerPreference: SessionProviderPreference;
  permissionMode: ClaudePermissionMode;
  workflowRuns: ReadonlyArray<WorkflowRun>;
  autoRun: boolean;
  titleUserEdited: boolean;
  activeProjectId?: ProjectId;
  activeMountId?: MountId;
  archivedAt?: IsoDateTime;
  deletedAt?: IsoDateTime;
  verbosity?: 'brief' | 'normal' | 'verbose';
  effort?: ModelEffort;
  modelOverride?: string;
  providerOverride?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type ProjectScript = Readonly<{
  id: ProjectScriptId;
  projectId: ProjectId;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type WorkspaceIntegrationProvider =
  'linear' | 'sentry' | 'gitlab' | 'jira' | 'bitbucket' | 'slack';

export type IntegrationBindingProvider = WorkspaceIntegrationProvider | 'github';

export const INTEGRATION_BINDING_PROVIDERS = [
  'linear',
  'sentry',
  'gitlab',
  'jira',
  'bitbucket',
  'slack',
  'github',
] satisfies ReadonlyArray<IntegrationBindingProvider>;

export const isIntegrationBindingProvider = (value: unknown): value is IntegrationBindingProvider =>
  typeof value === 'string' && INTEGRATION_BINDING_PROVIDERS.some((provider) => provider === value);

export type LinearIntegrationConfig = Readonly<{
  workspaceUrlKey: string;
  viewerUserId: string;
  viewerName: string;
}>;

export type SentryIntegrationConfig = Readonly<{
  org: string;
  project: string;
  projectName?: string;
  orgName?: string;
}>;

export type GitlabIntegrationConfig = Readonly<{
  userName: string;
  userId: string;
  host: string;
}>;

export type JiraIntegrationConfig = Readonly<{
  siteUrl: string;
  email: string;
  projectKey: string;
  accountId?: string;
  displayName?: string;
}>;

export type BitbucketIntegrationConfig = Readonly<{
  workspaceSlug: string;
  email: string;
  workspaceName?: string;
  accountId?: string;
  displayName?: string;
}>;

export type SlackIntegrationConfig = Readonly<{
  teamId: string;
  teamName: string;
  botUserId: string;
  botUserName?: string;
}>;

export type GithubIntegrationConfig = Readonly<Record<string, never>>;

export type IntegrationBindingConfig =
  | LinearIntegrationConfig
  | SentryIntegrationConfig
  | GitlabIntegrationConfig
  | JiraIntegrationConfig
  | BitbucketIntegrationConfig
  | SlackIntegrationConfig
  | GithubIntegrationConfig;

type IntegrationBindingBase = Readonly<{
  id: IntegrationBindingId;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  credentialId: IntegrationCredentialId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type LinearIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'linear';
    config: LinearIntegrationConfig;
  }>;

type SentryIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'sentry';
    config: SentryIntegrationConfig;
  }>;

export type GitlabIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'gitlab';
    config: GitlabIntegrationConfig;
  }>;

export type JiraIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'jira';
    config: JiraIntegrationConfig;
  }>;

export type BitbucketIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'bitbucket';
    config: BitbucketIntegrationConfig;
  }>;

export type SlackIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'slack';
    config: SlackIntegrationConfig;
  }>;

export type GithubIntegrationBinding = IntegrationBindingBase &
  Readonly<{
    provider: 'github';
    config: GithubIntegrationConfig;
  }>;

export type IntegrationBinding =
  | LinearIntegrationBinding
  | SentryIntegrationBinding
  | GitlabIntegrationBinding
  | JiraIntegrationBinding
  | BitbucketIntegrationBinding
  | SlackIntegrationBinding
  | GithubIntegrationBinding;

export type SessionExternalTaskProvider =
  'linear' | 'sentry' | 'gitlab' | 'github' | 'jira' | 'bitbucket' | 'slack';

export const SESSION_EXTERNAL_TASK_PROVIDERS = [
  'linear',
  'sentry',
  'gitlab',
  'github',
  'jira',
  'bitbucket',
  'slack',
] satisfies ReadonlyArray<SessionExternalTaskProvider>;

export const isSessionExternalTaskProvider = (
  value: unknown,
): value is SessionExternalTaskProvider =>
  typeof value === 'string' &&
  SESSION_EXTERNAL_TASK_PROVIDERS.some((provider) => provider === value);

export type SessionExternalTask = Readonly<{
  sessionId: SessionId;
  projectId?: ProjectId;
  branch?: string;
  provider: SessionExternalTaskProvider;
  externalId: string;
  identifier: string;
  url: string;
  title: string;
  createdAt: IsoDateTime;
}>;
