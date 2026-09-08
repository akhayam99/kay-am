import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  MountPullRequestProvider,
  MountPullRequestState,
  PrSeries,
  PrSeriesId,
  PrSeriesMember,
  PrSeriesMemberStatus,
  PrSeriesMembership,
  PrSeriesMemberView,
  PrSeriesView,
  ProjectId,
  SessionId,
} from '@goodboy/types';
import type { Database } from '../client';

type SeriesRow = {
  readonly id: PrSeriesId;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly workItemIdentifier: string | null;
  readonly workItemUrl: string | null;
  readonly plannedCount: number | null;
  readonly parentRequest: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type MemberRow = {
  readonly id: PrSeriesMember['id'];
  readonly seriesId: PrSeriesId;
  readonly mountId: MountId | null;
  readonly branch: string | null;
  readonly ordinal: number;
  readonly label: string;
  readonly status: PrSeriesMemberStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type LinkRow = {
  readonly id: string;
  readonly mountId: MountId;
  readonly provider: MountPullRequestProvider;
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

type InsertPrSeriesParams = {
  readonly db: Database;
  readonly series: PrSeries;
};

type GetPrSeriesParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly seriesId: PrSeriesId;
};

type ListPrSeriesParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly projectId?: ProjectId;
};

type ListPrSeriesMembersParams = {
  readonly db: Database;
  readonly seriesId: PrSeriesId;
};

type UpsertPrSeriesMemberParams = {
  readonly db: Database;
  readonly member: PrSeriesMember;
};

type FindPrSeriesMembershipParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly branch: string;
};

const SERIES_COLUMNS = `id, session_id AS sessionId, project_id AS projectId, name,
    work_item_identifier AS workItemIdentifier, work_item_url AS workItemUrl,
    planned_count AS plannedCount, parent_request_json AS parentRequest,
    created_at AS createdAt, updated_at AS updatedAt`;

const MEMBER_COLUMNS = `id, series_id AS seriesId, mount_id AS mountId, branch, ordinal, label,
    status, created_at AS createdAt, updated_at AS updatedAt`;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseIdentity = ({
  value,
}: {
  readonly value: string | null;
}): MountPullRequestIdentity | null => {
  if (value === null) {
    return null;
  }
  const parsed: unknown = ((): unknown => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })();
  if (!isRecord(parsed)) {
    return null;
  }
  const { provider, host, repoSlug, prNumber } = parsed;
  if (
    typeof provider !== 'string' ||
    typeof host !== 'string' ||
    typeof repoSlug !== 'string' ||
    typeof prNumber !== 'number'
  ) {
    return null;
  }
  return {
    provider: provider as MountPullRequestProvider,
    host,
    repoSlug,
    prNumber,
  };
};

const toSeries = (row: SeriesRow): PrSeries => ({
  ...row,
  parentRequest: parseIdentity({ value: row.parentRequest }),
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

const toMember = (row: MemberRow): PrSeriesMember => ({
  ...row,
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

const toLink = (row: LinkRow): MountPullRequestLink => ({
  ...row,
  snapshot: ((): unknown => {
    try {
      return JSON.parse(row.snapshot) as unknown;
    } catch {
      return null;
    }
  })(),
  lastObservedAt: new Date(row.lastObservedAt).toISOString() as IsoDateTime,
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

const resolveRequest = ({
  member,
  links,
}: {
  readonly member: PrSeriesMember;
  readonly links: ReadonlyArray<MountPullRequestLink>;
}): MountPullRequestLink | null => {
  if (member.mountId === null || member.branch === null) {
    return null;
  }
  const matching = links.filter(
    (link) => link.mountId === member.mountId && link.headBranch === member.branch,
  );
  return matching[matching.length - 1] ?? null;
};

export const insertPrSeries = async ({ db, series }: InsertPrSeriesParams): Promise<void> => {
  await db.execute(
    `INSERT INTO pr_series
      (id, session_id, project_id, name, work_item_identifier, work_item_url, planned_count,
       parent_request_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      series.id,
      series.sessionId,
      series.projectId,
      series.name,
      series.workItemIdentifier,
      series.workItemUrl,
      series.plannedCount,
      series.parentRequest === null ? null : JSON.stringify(series.parentRequest),
      Date.parse(series.createdAt),
      Date.parse(series.updatedAt),
    ],
  );
};

export const getPrSeries = async ({
  db,
  sessionId,
  seriesId,
}: GetPrSeriesParams): Promise<PrSeries | null> => {
  const rows = await db.select<SeriesRow>(
    `SELECT ${SERIES_COLUMNS} FROM pr_series WHERE session_id = ? AND id = ? LIMIT 1`,
    [sessionId, seriesId],
  );
  const row = rows[0];
  return row === undefined ? null : toSeries(row);
};

export const listPrSeriesMembers = async ({
  db,
  seriesId,
}: ListPrSeriesMembersParams): Promise<ReadonlyArray<PrSeriesMember>> => {
  const rows = await db.select<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM pr_series_members WHERE series_id = ? ORDER BY ordinal`,
    [seriesId],
  );
  return rows.map(toMember);
};

export const listPrSeries = async ({
  db,
  sessionId,
  projectId,
}: ListPrSeriesParams): Promise<ReadonlyArray<PrSeriesView>> => {
  const seriesRows = await db.select<SeriesRow>(
    `SELECT ${SERIES_COLUMNS} FROM pr_series
     WHERE session_id = ? AND (? IS NULL OR project_id = ?)
     ORDER BY created_at, id`,
    [sessionId, projectId ?? null, projectId ?? null],
  );
  if (seriesRows.length === 0) {
    return [];
  }
  const linkRows = await db.select<LinkRow>(
    `SELECT link.id, link.mount_id AS mountId, link.provider, link.host,
            link.repo_slug AS repoSlug, link.pr_number AS prNumber,
            link.head_branch AS headBranch, link.base_branch AS baseBranch,
            link.url, link.state, link.snapshot_json AS snapshot,
            link.last_observed_at AS lastObservedAt,
            link.created_at AS createdAt, link.updated_at AS updatedAt
     FROM mount_pr_links link
     JOIN session_worktrees mount ON mount.id = link.mount_id
     WHERE mount.session_id = ?
     ORDER BY link.created_at, link.id`,
    [sessionId],
  );
  const links = linkRows.map(toLink);
  const views: Array<PrSeriesView> = [];
  for (const row of seriesRows) {
    const series = toSeries(row);
    const members = await listPrSeriesMembers({ db, seriesId: series.id });
    const memberViews: ReadonlyArray<PrSeriesMemberView> = members.map((member) => ({
      ...member,
      request: resolveRequest({ member, links }),
    }));
    views.push({ ...series, members: memberViews });
  }
  return views;
};

export const upsertPrSeriesMember = async ({
  db,
  member,
}: UpsertPrSeriesMemberParams): Promise<void> => {
  await db.execute(
    `INSERT INTO pr_series_members
      (id, series_id, mount_id, branch, ordinal, label, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (series_id, ordinal) DO UPDATE SET
       mount_id = excluded.mount_id,
       branch = excluded.branch,
       label = excluded.label,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [
      member.id,
      member.seriesId,
      member.mountId,
      member.branch,
      member.ordinal,
      member.label,
      member.status,
      Date.parse(member.createdAt),
      Date.parse(member.updatedAt),
    ],
  );
};

export const findPrSeriesMembership = async ({
  db,
  sessionId,
  mountId,
  branch,
}: FindPrSeriesMembershipParams): Promise<PrSeriesMembership | null> => {
  const rows = await db.select<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM pr_series_members
     WHERE mount_id = ? AND branch = ? AND status != 'omitted'
     ORDER BY ordinal`,
    [mountId, branch],
  );
  for (const row of rows) {
    const member = toMember(row);
    const series = await getPrSeries({ db, sessionId, seriesId: member.seriesId });
    if (series !== null) {
      return { series, member };
    }
  }
  return null;
};
