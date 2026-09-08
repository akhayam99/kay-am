import type {
  MountCleanupDecision,
  MountCleanupProposal,
  MountDiskState,
  MountId,
  ProjectId,
  RetainedWorktreeReason,
  SessionId,
} from '@goodboy/types';

export type { SetFn, GetFn } from '../../slice-types';

export type CleanupTarget = {
  readonly sessionId: SessionId;
  readonly mountId: MountId | null;
  readonly projectId: ProjectId | null;
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly diskState: MountDiskState;
  readonly isRepoProject: boolean;
};

export type SessionCleanupOutcome = {
  readonly mountId: MountId;
  readonly worktreePath: string;
  readonly decision: MountCleanupDecision;
};

export type CleanupSessionMountsInput = {
  readonly sessionId: SessionId;
  readonly reason: RetainedWorktreeReason;
  readonly keepDirectories?: boolean;
};

export type ProposeMountCleanupInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly reason: RetainedWorktreeReason;
  readonly expectedBranch?: string;
  readonly request?: MountCleanupProposal['request'];
};

export type ResolveMountCleanupInput = {
  readonly sessionId: SessionId;
  readonly requestId: string;
  readonly decision: 'remove' | 'keep';
};

export type SessionCleanupKeyInput = {
  readonly sessionId: SessionId;
};
