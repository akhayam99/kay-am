import type { CachedPullRequest, GithubPrCacheEntry, IsoDateTime } from '@goodboy/types';
import type { Database } from '../client';

type Row = {
  branch: string;
  repo_slug: string;
  pr_json: string | null;
  fetched_at: number;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

function toDomain(row: Row): GithubPrCacheEntry {
  return {
    branch: row.branch,
    repoSlug: row.repo_slug,
    pr:
      row.pr_json != null && row.pr_json.length > 0
        ? (JSON.parse(row.pr_json) as CachedPullRequest)
        : null,
    fetchedAt: new Date(row.fetched_at).toISOString() as IsoDateTime,
  };
}

export const getGithubPrCache = async (
  db: Database,
  repoSlug: string,
  branch: string,
): Promise<GithubPrCacheEntry | null> => {
  const rows = await db.select<Row>(
    'SELECT branch, repo_slug, pr_json, fetched_at FROM github_pr_cache WHERE repo_slug = ? AND branch = ? LIMIT 1',
    [repoSlug, branch],
  );
  const first = rows[0];
  if (first === undefined) {
    return null;
  }
  const fetchedAt = first.fetched_at;
  if (Number.isNaN(fetchedAt) || Date.now() - fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  return toDomain(first);
};

export const upsertGithubPrCache = async (
  db: Database,
  entry: GithubPrCacheEntry,
): Promise<void> => {
  await db.execute(
    `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(repo_slug, branch) DO UPDATE SET
       pr_json = excluded.pr_json,
       fetched_at = excluded.fetched_at`,
    [
      entry.branch,
      entry.repoSlug,
      entry.pr ? JSON.stringify(entry.pr) : null,
      Number.isNaN(Date.parse(entry.fetchedAt)) ? 0 : Date.parse(entry.fetchedAt),
    ],
  );
};

export const deleteGithubPrCache = async (
  db: Database,
  repoSlug: string,
  branch: string,
): Promise<void> => {
  await db.execute('DELETE FROM github_pr_cache WHERE repo_slug = ? AND branch = ?', [
    repoSlug,
    branch,
  ]);
};
