import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  RetainedWorktreePath,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import { insertSessionWorktree, listSessionMounts } from './session-worktree';
import { listRetainedWorktreePaths, transferMountPathToRetained } from './retained-worktree-path';

const workspaceId = 'workspace' as WorkspaceId;
const sessionId = 'session' as SessionId;
const mountId = 'mount' as MountId;
const now = new Date('2026-09-08T10:00:00.000Z').toISOString() as IsoDateTime;

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  const timestamp = Date.parse(now);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'Workspace', 'workspace', timestamp, timestamp],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, 'Goal', 'idle', ?, ?)`,
    [sessionId, workspaceId, timestamp, timestamp],
  );
  await insertSessionWorktree(db, {
    id: mountId,
    sessionId,
    worktreePath: '/worktrees/mount',
    branch: 'feature',
    parallelIndex: 0,
    createdAt: timestamp,
  });
  await db.execute('UPDATE sessions SET active_mount_id = ? WHERE id = ?', [mountId, sessionId]);
  return db;
};

const retained = (): RetainedWorktreePath => ({
  id: 'retained',
  workspaceId,
  projectId: null,
  sourceSessionId: sessionId,
  sourceMountId: mountId,
  repoRoot: '/repo',
  worktreePath: '/worktrees/mount',
  branch: 'feature',
  reason: 'unmount',
  lastCheckedAt: null,
  createdAt: now,
  updatedAt: now,
});

describe('transferMountPathToRetained', () => {
  it('moves path ownership and keeps the logical mount history atomically', async () => {
    const db = await seed();

    const transferred = await transferMountPathToRetained({
      db,
      retained: retained(),
      expectedRevision: 0,
    });
    const mounts = await listSessionMounts({ db, sessionId });
    const retainedPaths = await listRetainedWorktreePaths({ db, workspaceId });
    const sessions = await db.select<{ readonly active_mount_id: string | null }>(
      'SELECT active_mount_id FROM sessions WHERE id = ?',
      [sessionId],
    );

    expect(transferred).toBe(true);
    expect(mounts[0]).toMatchObject({
      id: mountId,
      worktreePath: null,
      lastWorktreePath: '/worktrees/mount',
      isAttached: false,
      diskState: 'removed',
      revision: 1,
    });
    expect(retainedPaths.map((path) => path.worktreePath)).toEqual(['/worktrees/mount']);
    expect(sessions[0]?.active_mount_id).toBeNull();
  });

  it('rolls back retained ownership when the expected revision is stale', async () => {
    const db = await seed();

    const transferred = await transferMountPathToRetained({
      db,
      retained: retained(),
      expectedRevision: 1,
    });

    expect(transferred).toBe(false);
    expect(await listRetainedWorktreePaths({ db, workspaceId })).toEqual([]);
    expect((await listSessionMounts({ db, sessionId }))[0]?.worktreePath).toBe('/worktrees/mount');
  });
});
