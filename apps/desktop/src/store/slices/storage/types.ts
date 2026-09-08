import type { MountId, RetainedWorktreeReason, SessionId } from '@goodboy/types';

export type { SetFn, GetFn } from '../../slice-types';

export type ArchivedWorktreeTarget = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly repoPath: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly revision: number;
  readonly sizeBytes: number | null;
};

export type RetainedWorktreeTarget = {
  readonly id: string;
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly reason: RetainedWorktreeReason;
  readonly sizeBytes: number | null;
};

export type StorageStats = {
  readonly databaseBytes: number;
  readonly archivedSessionCount: number;
  readonly archivedTranscriptRows: number;
  readonly archivedTranscriptBytes: number;
  readonly archivedWorktrees: ReadonlyArray<ArchivedWorktreeTarget>;
  readonly retainedWorktrees: ReadonlyArray<RetainedWorktreeTarget>;
};

export type WorktreeRemovalResult = {
  readonly removed: number;
  readonly failed: number;
};
