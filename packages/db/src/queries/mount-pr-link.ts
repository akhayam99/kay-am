import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  MountPullRequestState,
  SessionId,
} from '@goodboy/types';
import type { Database } from '../client';

type Row = {
  readonly id: string;
  readonly mountId: MountId;
  readonly provider: MountPullRequestLink['provider'];
  readonly host: string;
  readonly repoSlug: string;
  readonly prNumber: number;
  readonly headBranch: string;
  readonly baseBranch: string | null;
  readonly url: string;
  readonly state: MountPullRequestState;
  readonly snapshot: string;
  readonly lastObservedAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type ListMountPullRequestLinksParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

type UpsertMountPullRequestLinkParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly link: MountPullRequestLink;
};

type HydrateGithubLinkParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly linkId: string;
};

type CacheRow = {
  readonly branch: string;
  readonly repo_slug: string;
  readonly pr_json: string | null;
  readonly fetched_at: number;
};

type MountRow = {
  readonly branch: string;
  readonly repo_slug: string | null;
};

const VALID_STATES: ReadonlySet<string> = new Set([
  'draft',
  'open',
  'approved',
  'queued',
  'merged',
  'closed',
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseSnapshot = ({ value }: { readonly value: string }): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const toDomain = (row: Row): MountPullRequestLink => ({
  ...row,
  snapshot: parseSnapshot({ value: row.snapshot }),
  lastObservedAt: new Date(row.lastObservedAt).toISOString() as IsoDateTime,
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

const validatedHost = ({ value }: { readonly value: string }): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.length === 0) {
      return null;
    }
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
};

export const upsertMountPullRequestLink = async ({
  db,
  sessionId,
  link,
}: UpsertMountPullRequestLinkParams): Promise<boolean> => {
  const result = await db.execute(
    `INSERT INTO mount_pr_links
      (id, mount_id, provider, host, repo_slug, pr_number, head_branch, base_branch,
       url, state, snapshot_json, last_observed_at, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (
       SELECT 1 FROM session_worktrees WHERE session_id = ? AND id = ?
     )
     ON CONFLICT (mount_id, provider, host, repo_slug, pr_number) DO UPDATE SET
       head_branch = excluded.head_branch,
       base_branch = excluded.base_branch,
       url = excluded.url,
       state = excluded.state,
       snapshot_json = excluded.snapshot_json,
       last_observed_at = excluded.last_observed_at,
       updated_at = excluded.updated_at`,
    [
      link.id,
      link.mountId,
      link.provider,
      link.host,
      link.repoSlug,
      link.prNumber,
      link.headBranch,
      link.baseBranch,
      link.url,
      link.state,
      JSON.stringify(link.snapshot) ?? 'null',
      Date.parse(link.lastObservedAt),
      Date.parse(link.createdAt),
      Date.parse(link.updatedAt),
      sessionId,
      link.mountId,
    ],
  );
  return result.rowsAffected > 0;
};

export const listMountPullRequestLinks = async ({
  db,
  sessionId,
  mountId,
}: ListMountPullRequestLinksParams): Promise<ReadonlyArray<MountPullRequestLink>> => {
  const rows = await db.select<Row>(
    `SELECT link.id, link.mount_id AS mountId, link.provider, link.host,
            link.repo_slug AS repoSlug, link.pr_number AS prNumber,
            link.head_branch AS headBranch, link.base_branch AS baseBranch,
            link.url, link.state, link.snapshot_json AS snapshot,
            link.last_observed_at AS lastObservedAt,
            link.created_at AS createdAt, link.updated_at AS updatedAt
     FROM mount_pr_links link
     JOIN session_worktrees mount ON mount.id = link.mount_id
     WHERE mount.session_id = ? AND mount.id = ?
     ORDER BY link.created_at, link.id`,
    [sessionId, mountId],
  );
  return rows.map(toDomain);
};

export const hydrateGithubMountPullRequestLink = async ({
  db,
  sessionId,
  mountId,
  linkId,
}: HydrateGithubLinkParams): Promise<MountPullRequestLink | null> => {
  const mountRows = await db.select<MountRow>(
    'SELECT branch, repo_slug FROM session_worktrees WHERE session_id = ? AND id = ? LIMIT 1',
    [sessionId, mountId],
  );
  const mount = mountRows[0];
  if (mount === undefined || mount.repo_slug === null) {
    return null;
  }
  const cacheRows = await db.select<CacheRow>(
    `SELECT branch, repo_slug, pr_json, fetched_at FROM github_pr_cache
     WHERE repo_slug = ? AND branch = ? LIMIT 1`,
    [mount.repo_slug, mount.branch],
  );
  const cache = cacheRows[0];
  if (
    cache === undefined ||
    cache.pr_json === null ||
    cache.repo_slug !== mount.repo_slug ||
    cache.branch !== mount.branch
  ) {
    return null;
  }
  const snapshot = parseSnapshot({ value: cache.pr_json });
  if (!isRecord(snapshot)) {
    return null;
  }
  const number = snapshot.number;
  const url = snapshot.url;
  const state = snapshot.state;
  const updatedAt = snapshot.updatedAt;
  if (
    typeof number !== 'number' ||
    !Number.isInteger(number) ||
    number <= 0 ||
    typeof url !== 'string' ||
    typeof state !== 'string' ||
    !VALID_STATES.has(state) ||
    typeof updatedAt !== 'string'
  ) {
    return null;
  }
  const host = validatedHost({ value: url });
  const requestUpdatedAt = Date.parse(updatedAt);
  if (host === null || Number.isNaN(requestUpdatedAt) || !Number.isFinite(cache.fetched_at)) {
    return null;
  }
  const now = Date.now();
  const link: MountPullRequestLink = {
    id: linkId,
    mountId,
    provider: 'github',
    host,
    repoSlug: mount.repo_slug,
    prNumber: number,
    headBranch: mount.branch,
    baseBranch: null,
    url,
    state: state as MountPullRequestState,
    snapshot,
    lastObservedAt: new Date(cache.fetched_at).toISOString() as IsoDateTime,
    createdAt: new Date(now).toISOString() as IsoDateTime,
    updatedAt: new Date(now).toISOString() as IsoDateTime,
  };
  const stored = await upsertMountPullRequestLink({ db, sessionId, link });
  return stored ? link : null;
};
