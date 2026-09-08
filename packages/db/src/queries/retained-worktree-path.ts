import type {
  IsoDateTime,
  MountId,
  RetainedWorktreePath,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { UniqueViolationError } from '../shared/errors';

type Row = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly projectId: RetainedWorktreePath['projectId'];
  readonly sourceSessionId: SessionId;
  readonly sourceMountId: MountId;
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly reason: RetainedWorktreePath['reason'];
  readonly lastCheckedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type ListRetainedWorktreePathsParams = {
  readonly db: Database;
  readonly workspaceId: WorkspaceId;
};

type TransferMountPathParams = {
  readonly db: Database;
  readonly retained: RetainedWorktreePath;
  readonly expectedRevision: number;
};

type MountRow = {
  readonly worktree_path: string | null;
  readonly revision: number;
};

const toDomain = (row: Row): RetainedWorktreePath => ({
  ...row,
  lastCheckedAt:
    row.lastCheckedAt === null ? null : (new Date(row.lastCheckedAt).toISOString() as IsoDateTime),
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

export const listRetainedWorktreePaths = async ({
  db,
  workspaceId,
}: ListRetainedWorktreePathsParams): Promise<ReadonlyArray<RetainedWorktreePath>> => {
  const rows = await db.select<Row>(
    `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
            source_session_id AS sourceSessionId, source_mount_id AS sourceMountId,
            repo_root AS repoRoot, worktree_path AS worktreePath, branch, reason,
            last_checked_at AS lastCheckedAt, created_at AS createdAt, updated_at AS updatedAt
     FROM retained_worktree_paths WHERE workspace_id = ? ORDER BY created_at, id`,
    [workspaceId],
  );
  return rows.map(toDomain);
};

export const transferMountPathToRetained = async ({
  db,
  retained,
  expectedRevision,
}: TransferMountPathParams): Promise<boolean> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const mountRows = await db.select<MountRow>(
      `SELECT worktree_path, revision FROM session_worktrees
       WHERE session_id = ? AND id = ? LIMIT 1`,
      [retained.sourceSessionId, retained.sourceMountId],
    );
    const mount = mountRows[0];
    if (
      mount === undefined ||
      mount.revision !== expectedRevision ||
      mount.worktree_path !== retained.worktreePath
    ) {
      await db.exec('ROLLBACK');
      return false;
    }
    const owners = await db.select<{ readonly id: string }>(
      `SELECT id FROM session_worktrees WHERE worktree_path = ? AND id != ?
       UNION ALL
       SELECT id FROM retained_worktree_paths WHERE worktree_path = ?
       LIMIT 1`,
      [retained.worktreePath, retained.sourceMountId, retained.worktreePath],
    );
    if (owners.length > 0) {
      throw new UniqueViolationError('retained worktree path', 'worktreePath');
    }
    await db.execute(
      `INSERT INTO retained_worktree_paths
        (id, workspace_id, project_id, source_session_id, source_mount_id, repo_root,
         worktree_path, branch, reason, last_checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        retained.id,
        retained.workspaceId,
        retained.projectId,
        retained.sourceSessionId,
        retained.sourceMountId,
        retained.repoRoot,
        retained.worktreePath,
        retained.branch,
        retained.reason,
        retained.lastCheckedAt === null ? null : Date.parse(retained.lastCheckedAt),
        Date.parse(retained.createdAt),
        Date.parse(retained.updatedAt),
      ],
    );
    const update = await db.execute(
      `UPDATE session_worktrees
       SET worktree_path = NULL, last_worktree_path = ?, is_attached = 0,
           disk_state = 'removed', revision = revision + 1, updated_at = ?
       WHERE session_id = ? AND id = ? AND revision = ? AND worktree_path = ?`,
      [
        retained.worktreePath,
        Date.parse(retained.updatedAt),
        retained.sourceSessionId,
        retained.sourceMountId,
        expectedRevision,
        retained.worktreePath,
      ],
    );
    if (update.rowsAffected === 0) {
      await db.exec('ROLLBACK');
      return false;
    }
    await db.execute(
      'UPDATE sessions SET active_mount_id = NULL WHERE id = ? AND active_mount_id = ?',
      [retained.sourceSessionId, retained.sourceMountId],
    );
    await db.exec('COMMIT');
    return true;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

type InsertRetainedWorktreePathParams = {
  readonly db: Database;
  readonly retained: RetainedWorktreePath;
};

type RetainedKeyParams = {
  readonly db: Database;
  readonly id: string;
};

type MarkRetainedCheckedParams = RetainedKeyParams & {
  readonly lastCheckedAt: IsoDateTime;
};

const SELECT_COLUMNS = `id, workspace_id AS workspaceId, project_id AS projectId,
            source_session_id AS sourceSessionId, source_mount_id AS sourceMountId,
            repo_root AS repoRoot, worktree_path AS worktreePath, branch, reason,
            last_checked_at AS lastCheckedAt, created_at AS createdAt, updated_at AS updatedAt`;

export const listAllRetainedWorktreePaths = async ({
  db,
}: {
  readonly db: Database;
}): Promise<ReadonlyArray<RetainedWorktreePath>> => {
  const rows = await db.select<Row>(
    `SELECT ${SELECT_COLUMNS} FROM retained_worktree_paths ORDER BY created_at, id`,
    [],
  );
  return rows.map(toDomain);
};

export const insertRetainedWorktreePath = async ({
  db,
  retained,
}: InsertRetainedWorktreePathParams): Promise<void> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const owners = await db.select<{ readonly id: string }>(
      'SELECT id FROM session_worktrees WHERE worktree_path = ? LIMIT 1',
      [retained.worktreePath],
    );
    if (owners.length > 0) {
      throw new UniqueViolationError('retained worktree path', 'worktreePath');
    }
    await db.execute('DELETE FROM retained_worktree_paths WHERE worktree_path = ?', [
      retained.worktreePath,
    ]);
    await db.execute(
      `INSERT INTO retained_worktree_paths
        (id, workspace_id, project_id, source_session_id, source_mount_id, repo_root,
         worktree_path, branch, reason, last_checked_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        retained.id,
        retained.workspaceId,
        retained.projectId,
        retained.sourceSessionId,
        retained.sourceMountId,
        retained.repoRoot,
        retained.worktreePath,
        retained.branch,
        retained.reason,
        retained.lastCheckedAt === null ? null : Date.parse(retained.lastCheckedAt),
        Date.parse(retained.createdAt),
        Date.parse(retained.updatedAt),
      ],
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const deleteRetainedWorktreePath = async ({ db, id }: RetainedKeyParams): Promise<void> => {
  await db.execute('DELETE FROM retained_worktree_paths WHERE id = ?', [id]);
};

export const markRetainedWorktreePathChecked = async ({
  db,
  id,
  lastCheckedAt,
}: MarkRetainedCheckedParams): Promise<void> => {
  await db.execute(
    'UPDATE retained_worktree_paths SET last_checked_at = ?, updated_at = ? WHERE id = ?',
    [Date.parse(lastCheckedAt), Date.parse(lastCheckedAt), id],
  );
};
