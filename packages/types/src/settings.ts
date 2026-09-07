import type { ProjectId, SessionId, WorkflowId, WorkspaceId } from './ids';
import type { ModelEffort, ProviderId } from './provider-registry';
import type { AgentRole } from './workflow';

export type VerbosityLevel = 'brief' | 'normal' | 'verbose';

export type ProviderBindings = Partial<Record<ProviderId, string>>;

export type AuxTaskId =
  | 'summarizer'
  | 'branch_naming'
  | 'plan_generation'
  | 'prose_polish'
  | 'agent_naming'
  | 'workflow_orchestrator'
  | 'pr_draft'
  | 'rebase';

export const TASKS: ReadonlyArray<{
  readonly id: AuxTaskId;
  readonly label: string;
  readonly description: string;
}> = [
  {
    id: 'summarizer',
    label: 'Step summaries',
    description: 'Condenses each finished step into the summary the next step starts from',
  },
  {
    id: 'branch_naming',
    label: 'Branch naming',
    description: 'Turns the session goal into a git branch name when the session is created',
  },
  {
    id: 'plan_generation',
    label: 'Plan drafting',
    description: 'Writes step plans in the workflow builder and Plan Studio',
  },
  {
    id: 'prose_polish',
    label: 'Prose polish',
    description: 'Polishes workflow goals and step instructions before they are used',
  },
  {
    id: 'agent_naming',
    label: 'Agent naming',
    description: 'Titles new agents, and the session itself, from your first message',
  },
  {
    id: 'workflow_orchestrator',
    label: 'Workflow orchestrator',
    description:
      'Reads each finished step of a dynamic workflow and picks the next one, or ends the run',
  },
  {
    id: 'pr_draft',
    label: 'PR and MR drafts',
    description: 'Preselected model for the agent that drafts a pull or merge request',
  },
  {
    id: 'rebase',
    label: 'Rebase',
    description: 'Preselected model for the agent that rebases the session branch onto main',
  },
];

export type TaskModelPreference = Readonly<{
  providerId: ProviderId;
  model: string;
  effort?: ModelEffort;
}>;

export type TaskModelPreferences = Readonly<Partial<Record<AuxTaskId, TaskModelPreference>>>;

export type RoleModelFallback = Readonly<{
  providerId: ProviderId;
  model: string;
  effort?: ModelEffort;
}>;

export type RoleModelPreference = Readonly<{
  providerId: ProviderId;
  model: string;
  effort: ModelEffort;
  fallback?: RoleModelFallback;
}>;

export type RoleModelPreferences = Readonly<Partial<Record<AgentRole, RoleModelPreference>>>;

export type OverrideSettings = Readonly<{
  defaultProviderId: ProviderId | null;
  defaultWorkflowId: WorkflowId | null;
  defaultBranchPrefix: string | null;
  parallelEnabled: boolean | null;
  defaultVerbosity: VerbosityLevel | null;
  providerBindings: ProviderBindings | null;
  taskModels: TaskModelPreferences | null;
  roleModels: RoleModelPreferences | null;
  parallelAgents: boolean | null;
  providerPool: ReadonlyArray<ProviderId> | null;
  attributionFooter: boolean | null;
}>;

export type ResolvedSettings = Readonly<{
  defaultProviderId: ProviderId;
  defaultWorkflowId: WorkflowId | null;
  defaultBranchPrefix: string;
  parallelEnabled: boolean;
  defaultVerbosity: VerbosityLevel;
}>;

export type GlobalSettings = Readonly<{
  defaultProviderId: ProviderId;
  defaultWorkflowId: WorkflowId | null;
  defaultBranchPrefix: string;
  parallelEnabled: boolean;
  defaultVerbosity: VerbosityLevel;
}>;

export type SettingsScope =
  | { kind: 'global' }
  | { kind: 'workspace'; workspaceId: WorkspaceId }
  | { kind: 'project'; projectId: ProjectId }
  | { kind: 'session'; sessionId: SessionId };
