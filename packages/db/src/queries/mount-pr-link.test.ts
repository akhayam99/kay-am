import { describe, expect, it } from 'vitest';
import type { MountId, SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import { insertSessionWorktree } from './session-worktree';
import { hydrateGithubMountPullRequestLink, listMountPullRequestLinks } from './mount-pr-link';

const workspaceId = 'workspace' as WorkspaceId;
const sessionId = 'session' as SessionId;
const mountId = 'mount' as MountId;
const now = Date.parse('2026-09-08T10:00:00.000Z');

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'Workspace', 'workspace', now, now],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, 'Goal', 'idle', ?, ?)`,
    [sessionId, workspaceId, now, now],
  );
  await insertSessionWorktree(db, {
    id: mountId,
    sessionId,
    worktreePath: '/mount',
    branch: 'feature',
    parallelIndex: 0,
    repoSlug: 'acme/repo',
    createdAt: now,
  });
  return db;
};

describe('hydrateGithubMountPullRequestLink', () => {
  it('persists a matching verified cache record with its validated host', async () => {
    const db = await seed();
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, ?, ?, ?)`,
      [
        'feature',
        'acme/repo',
        JSON.stringify({
          number: 42,
          title: 'Feature',
          url: 'https://github.example/acme/repo/pull/42',
          state: 'open',
          updatedAt: '2026-09-08T09:00:00.000Z',
        }),
        now,
      ],
    );

    const link = await hydrateGithubMountPullRequestLink({
      db,
      sessionId,
      mountId,
      linkId: 'link',
    });
    const stored = await listMountPullRequestLinks({ db, sessionId, mountId });

    expect(link).toMatchObject({
      id: 'link',
      host: 'github.example',
      repoSlug: 'acme/repo',
      prNumber: 42,
      headBranch: 'feature',
      baseBranch: null,
    });
    expect(stored).toHaveLength(1);
  });

  it('does not invent a link from an invalid request URL', async () => {
    const db = await seed();
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, ?, ?, ?)`,
      [
        'feature',
        'acme/repo',
        JSON.stringify({
          number: 42,
          title: 'Feature',
          url: 'not-a-url',
          state: 'open',
          updatedAt: '2026-09-08T09:00:00.000Z',
        }),
        now,
      ],
    );

    expect(
      await hydrateGithubMountPullRequestLink({
        db,
        sessionId,
        mountId,
        linkId: 'link',
      }),
    ).toBeNull();
    expect(await listMountPullRequestLinks({ db, sessionId, mountId })).toEqual([]);
  });
});
