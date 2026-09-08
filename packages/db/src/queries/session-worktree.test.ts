import { describe, expect, it } from 'vitest';
import type { IsoDateTime, MountId, SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { deleteSession } from './session';
import {
  deleteWorktreesForSession,
  insertSessionWorktree,
  listSessionMounts,
  listWorktreesForSession,
  updateSessionMountBranch,
  updateSessionWorktreeRepoSlug,
} from './session-worktree';

const workspaceId = 'w1' as WorkspaceId;
const sessionId = 's1' as SessionId;
const otherSessionId = 's2' as SessionId;

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  const now = Date.now();
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'ws', '/tmp/ws', now, now],
  );
  for (const id of [sessionId, otherSessionId]) {
    await db.execute(
      'INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, workspaceId, 'goal', 'idle', now, now],
    );
  }
  return db;
};

describe('updateSessionWorktreeRepoSlug', () => {
  it('stamps only the addressed mount of a multi-project session', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'wt-api',
      sessionId,
      worktreePath: '/tmp/wt/api',
      branch: 'ak/shared',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await insertSessionWorktree(db, {
      id: 'wt-web',
      sessionId,
      worktreePath: '/tmp/wt/web',
      branch: 'ak/shared',
      parallelIndex: 1,
      createdAt: Date.now(),
    });

    await updateSessionWorktreeRepoSlug({
      db,
      sessionId,
      worktreePath: '/tmp/wt/api',
      repoSlug: 'acme/api',
    });

    const rows = await listWorktreesForSession(db, sessionId);
    expect(rows.find((row) => row.id === 'wt-api')?.repoSlug).toBe('acme/api');
    expect(rows.find((row) => row.id === 'wt-web')?.repoSlug).toBeUndefined();
  });

  it('stamps nothing when the addressed path belongs to another session', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'wt-mine',
      sessionId,
      worktreePath: '/tmp/wt/mine',
      branch: 'ak/mine',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await insertSessionWorktree(db, {
      id: 'wt-theirs',
      sessionId: otherSessionId,
      worktreePath: '/tmp/wt/theirs',
      branch: 'ak/theirs',
      parallelIndex: 0,
      createdAt: Date.now(),
    });

    await updateSessionWorktreeRepoSlug({
      db,
      sessionId,
      worktreePath: '/tmp/wt/theirs',
      repoSlug: 'acme/theirs',
    });

    const theirs = await listWorktreesForSession(db, otherSessionId);
    const mine = await listWorktreesForSession(db, sessionId);
    expect(theirs[0]?.repoSlug).toBeUndefined();
    expect(mine[0]?.repoSlug).toBeUndefined();
  });
});

describe('insertSessionWorktree', () => {
  it('round-trips a repo slug and leaves an unstamped mount undefined', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'wt-stamped',
      sessionId,
      worktreePath: '/tmp/wt/stamped',
      branch: 'ak/stamped',
      parallelIndex: 0,
      repoSlug: 'acme/stamped',
      createdAt: Date.now(),
    });
    await insertSessionWorktree(db, {
      id: 'wt-bare',
      sessionId,
      worktreePath: '/tmp/wt/bare',
      branch: 'ak/bare',
      parallelIndex: 1,
      createdAt: Date.now(),
    });

    const rows = await listWorktreesForSession(db, sessionId);
    expect(rows.find((row) => row.id === 'wt-stamped')?.repoSlug).toBe('acme/stamped');
    expect(rows.find((row) => row.id === 'wt-bare')?.repoSlug).toBeUndefined();
  });
});

describe('updateSessionMountBranch', () => {
  it('updates only the mount addressed by session, id, and revision', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'mount-one',
      sessionId,
      worktreePath: '/tmp/wt/one',
      branch: 'old-one',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await insertSessionWorktree(db, {
      id: 'mount-two',
      sessionId,
      worktreePath: '/tmp/wt/two',
      branch: 'old-two',
      parallelIndex: 1,
      createdAt: Date.now(),
    });

    const updated = await updateSessionMountBranch({
      db,
      sessionId,
      mountId: 'mount-one' as MountId,
      branch: 'new-one',
      expectedRevision: 0,
      updatedAt: new Date().toISOString() as IsoDateTime,
    });
    const stale = await updateSessionMountBranch({
      db,
      sessionId,
      mountId: 'mount-one' as MountId,
      branch: 'stale',
      expectedRevision: 0,
      updatedAt: new Date().toISOString() as IsoDateTime,
    });
    const mounts = await listSessionMounts({ db, sessionId });

    expect(updated).toBe(true);
    expect(stale).toBe(false);
    expect(mounts.map((mount) => [mount.id, mount.branch, mount.revision])).toEqual([
      ['mount-one', 'new-one', 1],
      ['mount-two', 'old-two', 0],
    ]);
  });
});

describe('deleteWorktreesForSession', () => {
  it('releases physical paths without deleting logical mount history', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'mount',
      sessionId,
      worktreePath: '/tmp/wt/mount',
      branch: 'feature',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await db.execute('UPDATE sessions SET active_mount_id = ? WHERE id = ?', ['mount', sessionId]);

    await deleteWorktreesForSession(db, sessionId);

    const mounts = await listSessionMounts({ db, sessionId });
    const sessions = await db.select<{ readonly active_mount_id: string | null }>(
      'SELECT active_mount_id FROM sessions WHERE id = ?',
      [sessionId],
    );
    expect(await listWorktreesForSession(db, sessionId)).toEqual([]);
    expect(mounts[0]).toMatchObject({
      id: 'mount',
      worktreePath: null,
      lastWorktreePath: '/tmp/wt/mount',
      isAttached: false,
      diskState: 'removed',
    });
    expect(sessions[0]?.active_mount_id).toBeNull();
  });
});

describe('deleteSession', () => {
  it('clears the active mount reference before cascading mount deletion', async () => {
    const db = await seed();
    await insertSessionWorktree(db, {
      id: 'mount',
      sessionId,
      worktreePath: '/tmp/wt/mount',
      branch: 'feature',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await db.execute('UPDATE sessions SET active_mount_id = ? WHERE id = ?', ['mount', sessionId]);

    await deleteSession(db, sessionId);

    expect(await db.select('SELECT id FROM sessions WHERE id = ?', [sessionId])).toEqual([]);
    expect(await listSessionMounts({ db, sessionId })).toEqual([]);
  });
});
