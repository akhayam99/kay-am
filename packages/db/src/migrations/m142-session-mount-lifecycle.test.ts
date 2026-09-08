import { describe, expect, it } from 'vitest';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from './index';
import { migrate } from './runner';

const NOW = Date.parse('2026-09-08T10:00:00.000Z');

const migrateThrough141 = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(
    db,
    migrations.filter((migration) => migration.version <= 141),
  );
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ['workspace', 'Workspace', 'workspace', NOW, NOW],
  );
  await db.execute(
    `INSERT INTO projects (id, workspace_id, name, root_path, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'repo', ?, ?)`,
    ['project', 'workspace', 'Project', '/repo', NOW, NOW],
  );
  return db;
};

type SessionParams = {
  readonly db: Database;
  readonly id: string;
  readonly activeProjectId: string | null;
};

const insertSession = async ({ db, id, activeProjectId }: SessionParams): Promise<void> => {
  await db.execute(
    `INSERT INTO sessions
      (id, workspace_id, goal, state_kind, active_project_id, created_at, updated_at)
     VALUES (?, 'workspace', 'Goal', 'idle', ?, ?, ?)`,
    [id, activeProjectId, NOW, NOW],
  );
};

type WorktreeParams = {
  readonly db: Database;
  readonly id: string;
  readonly sessionId: string;
  readonly path: string;
  readonly parallelIndex: number;
  readonly createdAt: number;
  readonly projectId: string | null;
};

type InsertNewMountParams = {
  readonly id: string;
  readonly path: string | null;
};

const insertWorktree = async ({
  db,
  id,
  sessionId,
  path,
  parallelIndex,
  createdAt,
  projectId,
}: WorktreeParams): Promise<void> => {
  await db.execute(
    `INSERT INTO session_worktrees
      (id, session_id, worktree_path, branch, parallel_index, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, path, `branch-${id}`, parallelIndex, projectId, createdAt],
  );
};

describe('m142 session mount lifecycle', () => {
  it('preserves mount identity and chooses an active project mount deterministically', async () => {
    const db = await migrateThrough141();
    await insertSession({ db, id: 'session', activeProjectId: 'project' });
    await insertWorktree({
      db,
      id: 'later',
      sessionId: 'session',
      path: '/later',
      parallelIndex: 1,
      createdAt: NOW,
      projectId: 'project',
    });
    await insertWorktree({
      db,
      id: 'first',
      sessionId: 'session',
      path: '/first',
      parallelIndex: 0,
      createdAt: NOW + 1,
      projectId: 'project',
    });

    await migrate(db, migrations);

    const mounts = await db.select<{
      readonly id: string;
      readonly project_id: string | null;
      readonly worktree_path: string | null;
      readonly last_worktree_path: string | null;
      readonly disk_state: string;
      readonly updated_at: number;
    }>('SELECT * FROM session_worktrees ORDER BY parallel_index, created_at, id');
    const sessions = await db.select<{ readonly active_mount_id: string | null }>(
      "SELECT active_mount_id FROM sessions WHERE id = 'session'",
    );
    expect(mounts.map((mount) => mount.id)).toEqual(['first', 'later']);
    expect(mounts.map((mount) => mount.project_id)).toEqual(['project', 'project']);
    expect(mounts.map((mount) => mount.last_worktree_path)).toEqual(['/first', '/later']);
    expect(
      mounts.every((mount) => mount.disk_state === 'unchecked' && mount.updated_at >= NOW),
    ).toBe(true);
    expect(sessions[0]?.active_mount_id).toBe('first');
  });

  it('falls back to the first mount when the active project has no match', async () => {
    const db = await migrateThrough141();
    await insertSession({ db, id: 'session', activeProjectId: null });
    await insertWorktree({
      db,
      id: 'second',
      sessionId: 'session',
      path: '/second',
      parallelIndex: 0,
      createdAt: NOW + 1,
      projectId: null,
    });
    await insertWorktree({
      db,
      id: 'first',
      sessionId: 'session',
      path: '/first',
      parallelIndex: 0,
      createdAt: NOW,
      projectId: null,
    });

    await migrate(db, migrations);

    const rows = await db.select<{ readonly active_mount_id: string | null }>(
      "SELECT active_mount_id FROM sessions WHERE id = 'session'",
    );
    expect(rows[0]?.active_mount_id).toBe('first');
  });

  it('releases removed paths while retaining non-null path uniqueness', async () => {
    const db = await migrateThrough141();
    await insertSession({ db, id: 'session', activeProjectId: null });
    await migrate(db, migrations);

    const insert = async ({ id, path }: InsertNewMountParams): Promise<void> => {
      await db.execute(
        `INSERT INTO session_worktrees
          (id, session_id, worktree_path, branch, parallel_index, created_at, updated_at)
         VALUES (?, 'session', ?, 'branch', 0, ?, ?)`,
        [id, path, NOW, NOW],
      );
    };
    await insert({ id: 'owned', path: '/owned' });
    await insert({ id: 'removed-one', path: null });
    await insert({ id: 'removed-two', path: null });

    await expect(insert({ id: 'duplicate', path: '/owned' })).rejects.toThrow();
    const removed = await db.select<{ readonly count: number }>(
      'SELECT COUNT(*) AS count FROM session_worktrees WHERE worktree_path IS NULL',
    );
    expect(removed[0]?.count).toBe(2);
  });

  it('keeps active mount and lifecycle foreign keys valid', async () => {
    const db = await migrateThrough141();
    await insertSession({ db, id: 'session', activeProjectId: 'project' });
    await insertWorktree({
      db,
      id: 'mount',
      sessionId: 'session',
      path: '/mount',
      parallelIndex: 0,
      createdAt: NOW,
      projectId: 'project',
    });

    await migrate(db, migrations);

    expect(await db.select<{ readonly rowid: number }>('PRAGMA foreign_key_check')).toEqual([]);
    const activeMountForeignKeys = await db.select<{
      readonly table: string;
      readonly on_delete: string;
    }>('PRAGMA foreign_key_list(sessions)');
    expect(activeMountForeignKeys).toContainEqual(
      expect.objectContaining({ table: 'session_worktrees', on_delete: 'RESTRICT' }),
    );
    await expect(db.execute("DELETE FROM session_worktrees WHERE id = 'mount'")).rejects.toThrow();
  });
});
