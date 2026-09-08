import type { AgentId, ProjectId, SessionId } from './ids';
import type { AgentSourceKind } from './workflow';
import type { BranchCommit } from './worktree';

export type ResolveThreadState =
  'open' | 'working' | 'needs_answer' | 'fixed' | 'answered' | 'failed' | 'publishing' | 'closed';
export type ResolveAttemptPhase =
  'queued' | 'running' | 'waiting' | 'finished' | 'failed' | 'cancelled';
export type ResolveThread = Readonly<{
  id: string;
  sessionId: SessionId;
  projectId: ProjectId | null;
  prNumber: number;
  threadId: string;
  originKind: AgentSourceKind;
  state: ResolveThreadState;
  stateReason: string | null;
  revision: number;
  activeAttemptId: string | null;
  disposition: 'fix' | 'reply' | 'no_change' | null;
  replyDraft: string | null;
  commitShas: ReadonlyArray<string> | null;
  question: string | null;
  replyPostedAt: number | null;
  replyId: string | null;
  githubResolved: boolean | null;
  closedAt: number | null;
  closedSource: 'goodboy' | 'github' | null;
  createdAt: number;
  updatedAt: number;
}>;

export type ResolveAttempt = Readonly<{
  id: string;
  sessionId: SessionId;
  agentId: AgentId;
  prNumber: number;
  threadIds: ReadonlyArray<string>;
  provider: string;
  model: string;
  effort: string | null;
  instructions: string | null;
  phase: ResolveAttemptPhase;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  createdAt: number;
}>;

export type ResolveQueueApprovalState = 'none' | 'accepted' | 'deferred';

export type ResolveQueueItem = Readonly<{
  id: string;
  sessionId: SessionId;
  threadId: string;
  generation: number;
  reopenedFromItemId: string | null;
  candidateRevision: number;
  approvalState: ResolveQueueApprovalState;
  approvedRevision: number | null;
  approvedReplyHash: string | null;
  integratedSha: string | null;
  deferredAt: number | null;
  deliveredAt: number | null;
  supersededAt: number | null;
  createdAt: number;
  updatedAt: number;
}>;

export type ResolveQueueItemWithThread = Readonly<{
  item: ResolveQueueItem;
  thread: ResolveThread;
}>;

export type ResolveCandidateState = 'building' | 'ready' | 'integrated' | 'stale' | 'discarded';

export type ResolveCandidate = Readonly<{
  id: string;
  sessionId: SessionId;
  revision: number;
  baseSha: string;
  candidateSha: string;
  worktreePath: string;
  state: ResolveCandidateState;
  integratedSha: string | null;
  createdAt: number;
  updatedAt: number;
}>;

export type ResolveCandidateItem = Readonly<{
  candidateId: string;
  queueItemId: string;
  itemRevision: number;
}>;

export type ResolveCheckOutcome = 'passed' | 'failed' | 'errored';
export type ResolveCheckBreadth = 'scoped' | 'full';

export type ResolveCheckRun = Readonly<{
  id: string;
  sessionId: SessionId;
  candidateId: string;
  command: string;
  testIdentity: string | null;
  breadth: ResolveCheckBreadth;
  baseTree: string;
  candidateTree: string | null;
  acceptedSet: ReadonlyArray<string>;
  outcome: ResolveCheckOutcome;
  exitCode: number;
  durationMs: number;
  logRef: string | null;
  createdAt: number;
}>;

export type ResolveUncapturedWorkReason = 'quarantine_failed' | 'worktree_unavailable';

export type ResolveUncapturedWork = Readonly<{
  candidateId: string;
  worktreePath: string;
  baseSha: string;
  head: string;
  reason: ResolveUncapturedWorkReason;
  detail: string | null;
}>;

export type ResolvePublicationPhase =
  | 'previewed'
  | 'confirmed'
  | 'pushing'
  | 'pushed'
  | 'posting'
  | 'finished'
  | 'failed'
  | 'cancelled';

export type ResolvePublicationReplyPhase =
  'pending' | 'sending' | 'posted' | 'uncertain' | 'skipped';
export type ResolvePublicationResolvePhase =
  'pending' | 'resolving' | 'resolved' | 'uncertain' | 'skipped';

export type ResolvePublication = Readonly<{
  id: string;
  sessionId: SessionId;
  repo: string;
  prNumber: number;
  branch: string;
  localHead: string;
  remoteHead: string | null;
  commitShas: ReadonlyArray<string>;
  requiresPush: boolean;
  phase: ResolvePublicationPhase;
  pushedHead: string | null;
  confirmedAt: number | null;
  completedAt: number | null;
  error: string | null;
  createdAt: number;
}>;

export type ResolvePublicationThread = Readonly<{
  publicationId: string;
  threadId: string;
  revision: number;
  priorState: ResolveThreadState;
  replyBody: string | null;
  replyPhase: ResolvePublicationReplyPhase;
  replyId: string | null;
  replyPostedAt: number | null;
  resolvePhase: ResolvePublicationResolvePhase;
  resolvedAt: number | null;
  error: string | null;
}>;

export type PublicationBlocker =
  | 'uncaptured_work'
  | 'dirty_tree'
  | 'writer_busy'
  | 'publication_in_progress'
  | 'missing_commit'
  | 'remote_moved'
  | 'no_branch'
  | 'no_target';

export type ResolvePublicationExclusion = Readonly<{
  threadId: string;
  reason: 'needs_you' | 'working' | 'not_ready';
}>;

export type ResolvePublicationPreview = Readonly<{
  publicationId: string | null;
  repo: string | null;
  prNumber: number;
  branch: string;
  localHead: string;
  remoteHead: string | null;
  requiresPush: boolean;
  commits: ReadonlyArray<BranchCommit & { readonly threadIds: ReadonlyArray<string> }>;
  replies: ReadonlyArray<{
    readonly threadId: string;
    readonly body: string;
    readonly revision: number;
    readonly closes: boolean;
  }>;
  excluded: ReadonlyArray<ResolvePublicationExclusion>;
  blocker: PublicationBlocker | null;
}>;
