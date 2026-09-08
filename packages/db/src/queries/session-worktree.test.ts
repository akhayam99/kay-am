import { describe, expect, it } from 'vitest';
import type { IsoDateTime, MountId, SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { deleteSession } from './session';
import {
  deleteWorktreesForSession,
  detachSessionMounts,
  insertSessionWorktree,
  listMountPathOwnership,
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

describe('detachSessionMounts', () => {
  const retainedPath = (worktreePath: string) => ({
    id: 'retained-1',
    workspaceId,
    projectId: null,
    sourceSessionId: sessionId,
    sourceMountId: 'mount' as MountId,
    repoRoot: '/tmp/repo',
    worktreePath,
    branch: 'feature',
    reason: 'session_delete' as const,
    lastCheckedAt: null,
    createdAt: new Date(1).toISOString() as IsoDateTime,
    updatedAt: new Date(1).toISOString() as IsoDateTime,
  });

  const seedMountWithLinks = async (db: Database): Promise<void> => {
    await insertSessionWorktree(db, {
      id: 'mount',
      sessionId,
      worktreePath: '/tmp/wt/mount',
      branch: 'feature',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await db.execute('UPDATE sessions SET active_mount_id = ? WHERE id = ?', ['mount', sessionId]);
    await db.execute(
      `INSERT INTO mount_pr_links
         (id, mount_id, provider, host, repo_slug, pr_number, head_branch, base_branch, url,
          state, snapshot_json, last_observed_at, created_at, updated_at)
       VALUES ('link-1', 'mount', 'github', 'github.com', 'acme/app', 7, 'feature', 'main',
               'https://github.com/acme/app/pull/7', 'merged', '{}', 1, 1, 1)`,
    );
    await db.execute(
      `INSERT INTO mount_operations
         (id, session_id, mount_id, request_id, kind, status, expected_revision, input_json,
          created_at, updated_at)
       VALUES ('operation-1', ?, 'mount', 'req-1', 'unmount', 'succeeded', 0, '{}', 1, 1)`,
      [sessionId],
    );
  };

  it('keeps the mount row and its request links while releasing the path', async () => {
    const db = await seed();
    await seedMountWithLinks(db);

    await detachSessionMounts({
      db,
      sessionId,
      detached: [{ mountId: 'mount' as MountId, diskState: 'removed' }],
      retained: [],
    });

    const mounts = await listSessionMounts({ db, sessionId });
    const links = await db.select<{ readonly id: string }>('SELECT id FROM mount_pr_links', []);
    const operations = await db.select<{ readonly id: string }>(
      'SELECT id FROM mount_operations',
      [],
    );
    const sessions = await db.select<{ readonly active_mount_id: string | null }>(
      'SELECT active_mount_id FROM sessions WHERE id = ?',
      [sessionId],
    );
    expect(mounts[0]).toMatchObject({
      id: 'mount',
      worktreePath: null,
      lastWorktreePath: '/tmp/wt/mount',
      isAttached: false,
      diskState: 'removed',
    });
    expect(links.map((link) => link.id)).toEqual(['link-1']);
    expect(operations.map((operation) => operation.id)).toEqual(['operation-1']);
    expect(sessions[0]?.active_mount_id).toBeNull();
  });

  it('stops claiming the released path for ownership and lets another mount take it', async () => {
    const db = await seed();
    await seedMountWithLinks(db);

    await detachSessionMounts({
      db,
      sessionId,
      detached: [{ mountId: 'mount' as MountId, diskState: 'removed' }],
      retained: [],
    });
    await db.execute('UPDATE sessions SET deleted_at = ? WHERE id = ?', [Date.now(), sessionId]);
    await insertSessionWorktree(db, {
      id: 'reuse',
      sessionId: otherSessionId,
      worktreePath: '/tmp/wt/mount',
      branch: 'feature',
      parallelIndex: 0,
      createdAt: Date.now(),
    });

    const ownership = await listMountPathOwnership(db);
    expect(ownership.map((row) => [row.mountId, row.worktreePath])).toEqual([
      ['reuse', '/tmp/wt/mount'],
    ]);
  });

  it('records a kept directory as retained so it never reads as an orphan', async () => {
    const db = await seed();
    await seedMountWithLinks(db);

    await detachSessionMounts({
      db,
      sessionId,
      detached: [{ mountId: 'mount' as MountId, diskState: 'present' }],
      retained: [retainedPath('/tmp/wt/mount')],
    });

    const rows = await db.select<{ readonly worktree_path: string; readonly reason: string }>(
      'SELECT worktree_path, reason FROM retained_worktree_paths',
      [],
    );
    const mounts = await listSessionMounts({ db, sessionId });
    expect(rows).toEqual([{ worktree_path: '/tmp/wt/mount', reason: 'session_delete' }]);
    expect(mounts[0]).toMatchObject({ worktreePath: null, diskState: 'present' });
  });

  it('refuses a new mount on a path a retained record still owns', async () => {
    const db = await seed();
    await seedMountWithLinks(db);
    await detachSessionMounts({
      db,
      sessionId,
      detached: [{ mountId: 'mount' as MountId, diskState: 'present' }],
      retained: [retainedPath('/tmp/wt/mount')],
    });

    await expect(
      insertSessionWorktree(db, {
        id: 'reuse',
        sessionId: otherSessionId,
        worktreePath: '/tmp/wt/mount',
        branch: 'feature',
        parallelIndex: 0,
        createdAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  it('releases a mount the caller forgot to name', async () => {
    const db = await seed();
    await seedMountWithLinks(db);
    await insertSessionWorktree(db, {
      id: 'second',
      sessionId,
      worktreePath: '/tmp/wt/second',
      branch: 'feature-2',
      parallelIndex: 1,
      createdAt: Date.now(),
    });

    await detachSessionMounts({
      db,
      sessionId,
      detached: [{ mountId: 'mount' as MountId, diskState: 'removed' }],
      retained: [],
    });

    const mounts = await listSessionMounts({ db, sessionId });
    expect(mounts.map((mount) => [mount.id, mount.worktreePath, mount.diskState])).toEqual([
      ['mount', null, 'removed'],
      ['second', null, 'unchecked'],
    ]);
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
