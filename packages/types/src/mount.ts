import type { IsoDateTime, MountId, ProjectId, SessionId, WorkspaceId } from './ids';

export type MountDiskState = 'unchecked' | 'present' | 'missing' | 'removed';

export type SessionMount = Readonly<{
  id: MountId;
  sessionId: SessionId;
  projectId: ProjectId | null;
  worktreePath: string | null;
  lastWorktreePath: string | null;
  branch: string;
  baseBranch: string | null;
  parallelIndex: number;
  mountName: string | null;
  repoSlug: string | null;
  isAttached: boolean;
  diskState: MountDiskState;
  revision: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type MountPullRequestProvider = 'github' | 'gitlab' | 'bitbucket';

export type MountPullRequestIdentity = Readonly<{
  provider: MountPullRequestProvider;
  host: string;
  repoSlug: string;
  prNumber: number;
}>;

export type MountPullRequestState = 'draft' | 'open' | 'approved' | 'queued' | 'merged' | 'closed';

export type MountPullRequestLink = MountPullRequestIdentity &
  Readonly<{
    id: string;
    mountId: MountId;
    headBranch: string;
    baseBranch: string | null;
    url: string;
    state: MountPullRequestState;
    snapshot: unknown;
    lastObservedAt: IsoDateTime;
    createdAt: IsoDateTime;
    updatedAt: IsoDateTime;
  }>;

export type MountOperationKind =
  'attach' | 'unmount' | 'switch' | 'fork' | 'remove' | 'restore' | 'retain';

export type MountOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'uncertain';

export type MountOperation = Readonly<{
  id: string;
  sessionId: SessionId;
  mountId: MountId | null;
  requestId: string;
  kind: MountOperationKind;
  status: MountOperationStatus;
  expectedRevision: number;
  input: unknown;
  result: unknown | null;
  errorCode: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type RetainedWorktreeReason =
  | 'unmount'
  | 'merge_cleanup'
  | 'archive'
  | 'session_delete'
  | 'project_disconnect'
  | 'settings'
  | 'orphan';

export type RetainedWorktreePath = Readonly<{
  id: string;
  workspaceId: WorkspaceId;
  projectId: ProjectId | null;
  sourceSessionId: SessionId;
  sourceMountId: MountId;
  repoRoot: string;
  worktreePath: string;
  branch: string;
  reason: RetainedWorktreeReason;
  lastCheckedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type SessionMountView = SessionMount &
  Readonly<{
    projectId: ProjectId;
    mountName: string;
    repoRoot: string;
  }>;

export type MountBranchObservationState = 'matched' | 'mismatch' | 'detached' | 'unavailable';

export type MountBranchObservation = Readonly<{
  mountId: MountId;
  sessionId: SessionId;
  state: MountBranchObservationState;
  recordedBranch: string;
  observedBranch: string | null;
  revision: number;
  observedAt: IsoDateTime;
}>;

export type MountRecoveryCode =
  | 'branch-mismatch'
  | 'branch-missing'
  | 'branch-taken'
  | 'directory-busy'
  | 'directory-occupied'
  | 'mount-missing'
  | 'project-missing'
  | 'repository-unavailable'
  | 'revision-conflict'
  | 'unknown-state';

export type MountBranchResolution = 'adopt-observed' | 'keep-both';

export type MountCleanupDisposition = 'removed' | 'missing' | 'kept';

export type MountCleanupDecision =
  | { readonly kind: 'removed'; readonly path: string }
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'kept'; readonly path: string; readonly reason: string }
  | { readonly kind: 'failed'; readonly path: string; readonly reason: string };

export type MountCleanupProposal = Readonly<{
  requestId: string;
  sessionId: SessionId;
  mountId: MountId;
  projectId: ProjectId | null;
  reason: RetainedWorktreeReason;
  repoRoot: string;
  worktreePath: string;
  branch: string;
  sizeBytes: number | null;
  request: MountPullRequestIdentity | null;
  createdAt: IsoDateTime;
}>;
