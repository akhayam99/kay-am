import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import { getGithubPrCache, upsertGithubPrCache } from './github-pr-cache';

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const workspaceId = 'workspace-1' as WorkspaceId;
const sessionId = 'session-1' as SessionId;

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'workspace', 'workspace', NOW, NOW],
  );
  await db.execute(
    'INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, workspaceId, 'goal', 'idle', NOW, NOW],
  );
  return db;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('GitHub PR cache', () => {
  it('treats entries older than ten minutes and invalid timestamps as stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const db = await seed();
    await upsertGithubPrCache(db, {
      branch: 'ak/stale',
      repoSlug: 'acme/repo',
      pr: null,
      fetchedAt: new Date(NOW - 10 * 60 * 1000 - 1).toISOString(),
    });
    await upsertGithubPrCache(db, {
      branch: 'ak/invalid',
      repoSlug: 'acme/repo',
      pr: null,
      fetchedAt: 'not-a-date',
    });
    await upsertGithubPrCache(db, {
      branch: 'ak/fresh',
      repoSlug: 'acme/repo',
      pr: null,
      fetchedAt: new Date(NOW - 9 * 60 * 1000).toISOString(),
    });

    await expect(getGithubPrCache(db, 'acme/repo', 'ak/stale')).resolves.toBeNull();
    await expect(getGithubPrCache(db, 'acme/repo', 'ak/invalid')).resolves.toBeNull();
    await expect(getGithubPrCache(db, 'acme/repo', 'ak/fresh')).resolves.toMatchObject({
      branch: 'ak/fresh',
    });
  });
});
