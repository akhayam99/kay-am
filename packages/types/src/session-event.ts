import type { IsoDateTime, SessionEventId, SessionId } from './ids';

export const SESSION_EVENT_KINDS = [
  'worktree_created',
  'branch_created',
  'branch_switched',
  'issue_linked',
  'issue_unlinked',
  'pr_created',
  'pr_discovered',
  'pr_ready',
  'pr_approved',
  'pr_merged',
  'pr_closed',
  'workflow_started',
  'workflow_discarded',
  'workflow_restored',
  'workflow_deleted',
  'decisions_changed',
  'project_materialized',
  'project_materialization_refused',
  'project_materialization_proposed',
  'project_materialization_dismissed',
  'project_detached',
  'external_task_created',
  'rebase_requested',
] as const;

export type SessionEventKind = (typeof SESSION_EVENT_KINDS)[number];

export const MATERIALIZATION_DEFERRAL_CAUSES = ['batch', 'scope'] as const;

export type MaterializationDeferralCause = (typeof MATERIALIZATION_DEFERRAL_CAUSES)[number];

export type SessionEventPayload = Readonly<{
  worktreePath?: string;
  branch?: string;
  from?: string;
  to?: string;
  provider?: string;
  identifier?: string;
  title?: string;
  url?: string;
  number?: number;
  workflowName?: string;
  runId?: string;
  added?: number;
  removed?: number;
  projectId?: string;
  mountId?: string;
  host?: string;
  repository?: string;
  projectName?: string;
  reason?: string;
  kept?: boolean;
  externalId?: string;
  agentId?: string;
  behind?: number;
  turnRunId?: string;
  deferralCause?: MaterializationDeferralCause;
}>;

export type SessionEvent = Readonly<{
  id: SessionEventId;
  sessionId: SessionId;
  kind: SessionEventKind;
  payload: SessionEventPayload | null;
  createdAt: IsoDateTime;
}>;
