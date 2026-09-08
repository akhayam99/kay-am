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

export type MountPullRequestState = 'draft' | 'open' | 'approved' | 'queued' | 'merged' | 'closed';

export type MountPullRequestLink = Readonly<{
  id: string;
  mountId: MountId;
  provider: MountPullRequestProvider;
  host: string;
  repoSlug: string;
  prNumber: number;
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
