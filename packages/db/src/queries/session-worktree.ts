import type {
  IsoDateTime,
  MountDiskState,
  MountId,
  ProjectId,
  RetainedWorktreePath,
  SessionId,
  SessionMount,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { UniqueViolationError } from '../shared/errors';

type SessionWorktreeRow = {
  readonly id: string;
  readonly session_id: string;
  readonly worktree_path: string | null;
  readonly last_worktree_path: string | null;
  readonly branch: string;
  readonly base_branch: string | null;
  readonly parallel_index: number;
  readonly project_id: string | null;
  readonly mount_name: string | null;
  readonly repo_slug: string | null;
  readonly is_attached: number;
  readonly disk_state: MountDiskState;
  readonly revision: number;
  readonly created_at: number;
  readonly updated_at: number;
};

export type SessionWorktree = {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly worktreePath: string;
  readonly branch: string;
  readonly parallelIndex: number;
  readonly projectId?: ProjectId;
  readonly mountName?: string;
  readonly repoSlug?: string;
  readonly createdAt: number;
};

type MountKeyParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

type ListSessionMountsParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
};

type InsertSessionMountParams = {
  readonly db: Database;
  readonly mount: SessionMount;
};

type UpdateSessionMountBranchParams = MountKeyParams & {
  readonly branch: string;
  readonly expectedRevision: number;
  readonly updatedAt: IsoDateTime;
};

type UpdateSessionMountLifecycleParams = MountKeyParams & {
  readonly worktreePath: string | null;
  readonly isAttached: boolean;
  readonly diskState: MountDiskState;
  readonly expectedRevision: number;
  readonly updatedAt: IsoDateTime;
};

type PathOwnerParams = {
  readonly db: Database;
  readonly worktreePath: string;
  readonly excludedMountId: MountId | null;
};

const toMount = (row: SessionWorktreeRow): SessionMount => ({
  id: row.id as MountId,
  sessionId: row.session_id as SessionId,
  projectId: row.project_id as ProjectId | null,
  worktreePath: row.worktree_path,
  lastWorktreePath: row.last_worktree_path,
  branch: row.branch,
  baseBranch: row.base_branch,
  parallelIndex: row.parallel_index,
  mountName: row.mount_name,
  repoSlug: row.repo_slug,
  isAttached: row.is_attached !== 0,
  diskState: row.disk_state,
  revision: row.revision,
  createdAt: new Date(row.created_at).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updated_at).toISOString() as IsoDateTime,
});

const toPresentWorktree = (row: SessionWorktreeRow): SessionWorktree | null => {
  if (row.worktree_path === null) {
    return null;
  }
  return {
    id: row.id,
    sessionId: row.session_id as SessionId,
    worktreePath: row.worktree_path,
    branch: row.branch,
    parallelIndex: row.parallel_index,
    ...(row.project_id !== null ? { projectId: row.project_id as ProjectId } : {}),
    ...(row.mount_name !== null ? { mountName: row.mount_name } : {}),
    ...(row.repo_slug !== null ? { repoSlug: row.repo_slug } : {}),
    createdAt: row.created_at,
  };
};

const hasPathOwner = async ({
  db,
  worktreePath,
  excludedMountId,
}: PathOwnerParams): Promise<boolean> => {
  const rows = await db.select<{ readonly source: string }>(
    `SELECT 'mount' AS source
     FROM session_worktrees mount
     JOIN sessions s ON s.id = mount.session_id
     WHERE mount.worktree_path = ? AND s.deleted_at IS NULL AND (? IS NULL OR mount.id != ?)
     UNION ALL
     SELECT 'retained' AS source
     FROM retained_worktree_paths
     WHERE worktree_path = ?
     LIMIT 1`,
    [worktreePath, excludedMountId, excludedMountId, worktreePath],
  );
  return rows.length > 0;
};

export const insertSessionMount = async ({
  db,
  mount,
}: InsertSessionMountParams): Promise<void> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    if (
      mount.worktreePath !== null &&
      (await hasPathOwner({ db, worktreePath: mount.worktreePath, excludedMountId: null }))
    ) {
      throw new UniqueViolationError('session mount', 'worktreePath');
    }
    await db.execute(
      `INSERT INTO session_worktrees
        (id, session_id, worktree_path, last_worktree_path, branch, base_branch, parallel_index,
         project_id, mount_name, repo_slug, is_attached, disk_state, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mount.id,
        mount.sessionId,
        mount.worktreePath,
        mount.lastWorktreePath,
        mount.branch,
        mount.baseBranch,
        mount.parallelIndex,
        mount.projectId,
        mount.mountName,
        mount.repoSlug,
        mount.isAttached ? 1 : 0,
        mount.diskState,
        mount.revision,
        Date.parse(mount.createdAt),
        Date.parse(mount.updatedAt),
      ],
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const getSessionMount = async ({
  db,
  sessionId,
  mountId,
}: MountKeyParams): Promise<SessionMount | null> => {
  const rows = await db.select<SessionWorktreeRow>(
    'SELECT * FROM session_worktrees WHERE session_id = ? AND id = ? LIMIT 1',
    [sessionId, mountId],
  );
  const row = rows[0];
  return row === undefined ? null : toMount(row);
};

export const listSessionMounts = async ({
  db,
  sessionId,
}: ListSessionMountsParams): Promise<ReadonlyArray<SessionMount>> => {
  const rows = await db.select<SessionWorktreeRow>(
    'SELECT * FROM session_worktrees WHERE session_id = ? ORDER BY parallel_index, created_at, id',
    [sessionId],
  );
  return rows.map(toMount);
};

export const updateSessionMountBranch = async ({
  db,
  sessionId,
  mountId,
  branch,
  expectedRevision,
  updatedAt,
}: UpdateSessionMountBranchParams): Promise<boolean> => {
  const result = await db.execute(
    `UPDATE session_worktrees
     SET branch = ?, revision = revision + 1, updated_at = ?
     WHERE session_id = ? AND id = ? AND revision = ?`,
    [branch, Date.parse(updatedAt), sessionId, mountId, expectedRevision],
  );
  return result.rowsAffected > 0;
};

export const deleteSessionMount = async ({
  db,
  sessionId,
  mountId,
}: MountKeyParams): Promise<boolean> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.execute(
      'UPDATE sessions SET active_mount_id = NULL WHERE id = ? AND active_mount_id = ?',
      [sessionId, mountId],
    );
    const result = await db.execute(
      'DELETE FROM session_worktrees WHERE session_id = ? AND id = ?',
      [sessionId, mountId],
    );
    await db.exec('COMMIT');
    return result.rowsAffected > 0;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const updateSessionMountLifecycle = async ({
  db,
  sessionId,
  mountId,
  worktreePath,
  isAttached,
  diskState,
  expectedRevision,
  updatedAt,
}: UpdateSessionMountLifecycleParams): Promise<boolean> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    if (
      worktreePath !== null &&
      (await hasPathOwner({ db, worktreePath, excludedMountId: mountId }))
    ) {
      throw new UniqueViolationError('session mount', 'worktreePath');
    }
    const result = await db.execute(
      `UPDATE session_worktrees
       SET worktree_path = ?,
           last_worktree_path = COALESCE(?, worktree_path, last_worktree_path),
           is_attached = ?, disk_state = ?, revision = revision + 1, updated_at = ?
       WHERE session_id = ? AND id = ? AND revision = ?`,
      [
        worktreePath,
        worktreePath,
        isAttached ? 1 : 0,
        diskState,
        Date.parse(updatedAt),
        sessionId,
        mountId,
        expectedRevision,
      ],
    );
    await db.exec('COMMIT');
    return result.rowsAffected > 0;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const insertSessionWorktree = async (
  db: Database,
  worktree: SessionWorktree,
): Promise<void> => {
  const createdAt = new Date(worktree.createdAt).toISOString() as IsoDateTime;
  await insertSessionMount({
    db,
    mount: {
      id: worktree.id as MountId,
      sessionId: worktree.sessionId,
      projectId: worktree.projectId ?? null,
      worktreePath: worktree.worktreePath,
      lastWorktreePath: worktree.worktreePath,
      branch: worktree.branch,
      baseBranch: null,
      parallelIndex: worktree.parallelIndex,
      mountName: worktree.mountName ?? null,
      repoSlug: worktree.repoSlug ?? null,
      isAttached: true,
      diskState: 'unchecked',
      revision: 0,
      createdAt,
      updatedAt: createdAt,
    },
  });
};

export const listWorktreesForSession = async (
  db: Database,
  sessionId: SessionId,
): Promise<ReadonlyArray<SessionWorktree>> => {
  const rows = await db.select<SessionWorktreeRow>(
    `SELECT * FROM session_worktrees
     WHERE session_id = ? AND worktree_path IS NOT NULL AND is_attached = 1
     ORDER BY parallel_index, created_at, id`,
    [sessionId],
  );
  return rows.flatMap((row) => {
    const worktree = toPresentWorktree(row);
    return worktree === null ? [] : [worktree];
  });
};

export const listWorktreesForSessions = async (
  db: Database,
  sessionIds: ReadonlyArray<SessionId>,
): Promise<Map<SessionId, ReadonlyArray<SessionWorktree>>> => {
  const out = new Map<SessionId, SessionWorktree[]>();
  if (sessionIds.length === 0) {
    return out;
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  const rows = await db.select<SessionWorktreeRow>(
    `SELECT * FROM session_worktrees
     WHERE session_id IN (${placeholders}) AND worktree_path IS NOT NULL AND is_attached = 1
     ORDER BY session_id, parallel_index, created_at, id`,
    sessionIds,
  );
  for (const row of rows) {
    const worktree = toPresentWorktree(row);
    if (worktree === null) {
      continue;
    }
    const bucket = out.get(worktree.sessionId) ?? [];
    bucket.push(worktree);
    out.set(worktree.sessionId, bucket);
  }
  return out;
};

export const deleteWorktreesForSession = async (
  db: Database,
  sessionId: SessionId,
): Promise<void> => {
  const now = Date.now();
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.execute('UPDATE sessions SET active_mount_id = NULL WHERE id = ?', [sessionId]);
    await db.execute(
      `UPDATE session_worktrees
       SET last_worktree_path = COALESCE(worktree_path, last_worktree_path), worktree_path = NULL,
           is_attached = 0, disk_state = 'removed', revision = revision + 1, updated_at = ?
       WHERE session_id = ?`,
      [now, sessionId],
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

type DeleteSessionWorktreeForProjectParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
};

export const deleteSessionWorktreeForProject = async ({
  db,
  sessionId,
  projectId,
}: DeleteSessionWorktreeForProjectParams): Promise<void> => {
  const now = Date.now();
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.execute(
      `UPDATE sessions SET active_mount_id = NULL
       WHERE id = ? AND active_mount_id IN (
         SELECT id FROM session_worktrees WHERE session_id = ? AND project_id = ?
       )`,
      [sessionId, sessionId, projectId],
    );
    await db.execute(
      `UPDATE session_worktrees
       SET last_worktree_path = COALESCE(worktree_path, last_worktree_path), worktree_path = NULL,
           is_attached = 0, disk_state = 'removed', revision = revision + 1, updated_at = ?
       WHERE session_id = ? AND project_id = ?`,
      [now, sessionId, projectId],
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const updateSessionWorktreeBranch = async (
  db: Database,
  sessionId: SessionId,
  parallelIndex: number,
  branch: string,
): Promise<void> => {
  await db.execute(
    `UPDATE session_worktrees
     SET branch = ?, revision = revision + 1, updated_at = ?
     WHERE session_id = ? AND parallel_index = ?`,
    [branch, Date.now(), sessionId, parallelIndex],
  );
};

type UpdateSessionWorktreePathParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly parallelIndex: number;
  readonly worktreePath: string;
};

export const updateSessionWorktreePath = async ({
  db,
  sessionId,
  parallelIndex,
  worktreePath,
}: UpdateSessionWorktreePathParams): Promise<void> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    const mountRows = await db.select<{ readonly id: string }>(
      'SELECT id FROM session_worktrees WHERE session_id = ? AND parallel_index = ? LIMIT 1',
      [sessionId, parallelIndex],
    );
    const mountId = mountRows[0]?.id as MountId | undefined;
    if (
      mountId !== undefined &&
      (await hasPathOwner({ db, worktreePath, excludedMountId: mountId }))
    ) {
      throw new UniqueViolationError('session mount', 'worktreePath');
    }
    await db.execute(
      `UPDATE session_worktrees
       SET worktree_path = ?, last_worktree_path = ?, is_attached = 1,
           disk_state = 'unchecked', revision = revision + 1, updated_at = ?
       WHERE session_id = ? AND parallel_index = ?`,
      [worktreePath, worktreePath, Date.now(), sessionId, parallelIndex],
    );
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

type UpdateSessionWorktreeRepoSlugParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly worktreePath: string;
  readonly repoSlug: string;
};

export const updateSessionWorktreeRepoSlug = async ({
  db,
  sessionId,
  worktreePath,
  repoSlug,
}: UpdateSessionWorktreeRepoSlugParams): Promise<void> => {
  await db.execute(
    `UPDATE session_worktrees
     SET repo_slug = ?, revision = revision + 1, updated_at = ?
     WHERE session_id = ? AND worktree_path = ?`,
    [repoSlug, Date.now(), sessionId, worktreePath],
  );
};

export const listAllSessionWorktrees = async (
  db: Database,
): Promise<ReadonlyArray<SessionWorktree>> => {
  const rows = await db.select<SessionWorktreeRow>(
    `SELECT mount.* FROM session_worktrees mount
     JOIN sessions s ON s.id = mount.session_id
     WHERE s.deleted_at IS NULL AND mount.worktree_path IS NOT NULL AND mount.is_attached = 1`,
    [],
  );
  return rows.flatMap((row) => {
    const worktree = toPresentWorktree(row);
    return worktree === null ? [] : [worktree];
  });
};

export type MountPathOwnership = {
  readonly mountId: MountId;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId | null;
  readonly worktreePath: string;
  readonly branch: string;
  readonly revision: number;
  readonly isSessionDeleted: boolean;
  readonly isSessionArchived: boolean;
};

type OwnershipRow = {
  readonly mountId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly worktreePath: string;
  readonly branch: string;
  readonly revision: number;
  readonly isSessionDeleted: number;
  readonly isSessionArchived: number;
};

export const listArchivedSessionMounts = async (
  db: Database,
): Promise<ReadonlyArray<SessionMount>> => {
  const rows = await db.select<SessionWorktreeRow>(
    `SELECT mount.* FROM session_worktrees mount
     JOIN sessions s ON s.id = mount.session_id
     WHERE s.archived_at IS NOT NULL AND s.deleted_at IS NULL AND mount.worktree_path IS NOT NULL
     ORDER BY mount.session_id, mount.parallel_index, mount.created_at, mount.id`,
    [],
  );
  return rows.map(toMount);
};

export const listMountPathOwnership = async (
  db: Database,
): Promise<ReadonlyArray<MountPathOwnership>> => {
  const rows = await db.select<OwnershipRow>(
    `SELECT mount.id AS mountId, mount.session_id AS sessionId, s.workspace_id AS workspaceId,
            mount.project_id AS projectId, mount.worktree_path AS worktreePath,
            mount.branch AS branch, mount.revision AS revision,
            CASE WHEN s.deleted_at IS NULL THEN 0 ELSE 1 END AS isSessionDeleted,
            CASE WHEN s.archived_at IS NULL THEN 0 ELSE 1 END AS isSessionArchived
     FROM session_worktrees mount
     JOIN sessions s ON s.id = mount.session_id
     WHERE mount.worktree_path IS NOT NULL
     ORDER BY mount.worktree_path`,
    [],
  );
  return rows.map((row) => ({
    mountId: row.mountId as MountId,
    sessionId: row.sessionId as SessionId,
    workspaceId: row.workspaceId as WorkspaceId,
    projectId: row.projectId === null ? null : (row.projectId as ProjectId),
    worktreePath: row.worktreePath,
    branch: row.branch,
    revision: row.revision,
    isSessionDeleted: row.isSessionDeleted !== 0,
    isSessionArchived: row.isSessionArchived !== 0,
  }));
};

export type MountDetachment = {
  readonly mountId: MountId;
  readonly diskState: MountDiskState;
};

type DetachSessionMountsParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly detached: ReadonlyArray<MountDetachment>;
  readonly retained: ReadonlyArray<RetainedWorktreePath>;
};

const DETACH_MOUNT_SQL = `UPDATE session_worktrees
   SET last_worktree_path = COALESCE(worktree_path, last_worktree_path), worktree_path = NULL,
       is_attached = 0, disk_state = ?, revision = revision + 1, updated_at = ?`;

export const detachSessionMounts = async ({
  db,
  sessionId,
  detached,
  retained,
}: DetachSessionMountsParams): Promise<void> => {
  const now = Date.now();
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.execute('UPDATE sessions SET active_mount_id = NULL WHERE id = ?', [sessionId]);
    for (const mount of detached) {
      await db.execute(`${DETACH_MOUNT_SQL} WHERE session_id = ? AND id = ?`, [
        mount.diskState,
        now,
        sessionId,
        mount.mountId,
      ]);
    }
    await db.execute(`${DETACH_MOUNT_SQL} WHERE session_id = ? AND worktree_path IS NOT NULL`, [
      'unchecked',
      now,
      sessionId,
    ]);
    for (const path of retained) {
      await db.execute('DELETE FROM retained_worktree_paths WHERE worktree_path = ?', [
        path.worktreePath,
      ]);
      await db.execute(
        `INSERT INTO retained_worktree_paths
          (id, workspace_id, project_id, source_session_id, source_mount_id, repo_root,
           worktree_path, branch, reason, last_checked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          path.id,
          path.workspaceId,
          path.projectId,
          path.sourceSessionId,
          path.sourceMountId,
          path.repoRoot,
          path.worktreePath,
          path.branch,
          path.reason,
          path.lastCheckedAt === null ? null : Date.parse(path.lastCheckedAt),
          Date.parse(path.createdAt),
          Date.parse(path.updatedAt),
        ],
      );
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};
