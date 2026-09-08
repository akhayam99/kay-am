import { migrate, migrations, type Database } from '@goodboy/db';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  MountPullRequestProvider,
  MountPullRequestState,
  PrSeries,
  PrSeriesId,
  PrSeriesMember,
  PrSeriesMemberId,
  ProjectId,
  SessionId,
  SessionMount,
  WorkspaceId,
} from '@goodboy/types';

export const RECOVERY_NOW = '2026-09-08T10:00:00.000Z' as IsoDateTime;
export const RECOVERY_WORKSPACE_ID = 'workspace-recovery' as WorkspaceId;
export const RECOVERY_PROJECT_ID = 'project-api' as ProjectId;
export const RECOVERY_SESSION_ID = 'session-split' as SessionId;

export const createMountRecoveryDatabase = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  const timestamp = Date.parse(RECOVERY_NOW);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [RECOVERY_WORKSPACE_ID, 'Engineering', 'engineering', timestamp, timestamp],
  );
  await db.execute(
    `INSERT INTO projects (id, workspace_id, name, root_path, kind, base_branch, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      RECOVERY_PROJECT_ID,
      RECOVERY_WORKSPACE_ID,
      'API',
      '/repo/api',
      'repo',
      'main',
      timestamp,
      timestamp,
    ],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [RECOVERY_SESSION_ID, RECOVERY_WORKSPACE_ID, 'Split ENG-3240', 'idle', timestamp, timestamp],
  );
  return db;
};

type MountFixtureParams = {
  readonly id: string;
  readonly branch: string;
  readonly position: number;
  readonly path?: string | null;
  readonly isAttached?: boolean;
  readonly diskState?: SessionMount['diskState'];
};

export const mountRecoveryFixture = ({
  id,
  branch,
  position,
  path = `/repo/api/.goodboy/worktrees/${id}`,
  isAttached = true,
  diskState = 'present',
}: MountFixtureParams): SessionMount => ({
  id: id as MountId,
  sessionId: RECOVERY_SESSION_ID,
  projectId: RECOVERY_PROJECT_ID,
  worktreePath: path,
  lastWorktreePath: path,
  branch,
  baseBranch: 'origin/main',
  parallelIndex: position,
  mountName: 'API',
  repoSlug: 'acme/api',
  isAttached,
  diskState,
  revision: 0,
  createdAt: RECOVERY_NOW,
  updatedAt: RECOVERY_NOW,
});

type LinkFixtureParams = {
  readonly id: string;
  readonly mountId: MountId;
  readonly provider?: MountPullRequestProvider;
  readonly number: number;
  readonly branch: string;
  readonly state: MountPullRequestState;
  readonly host?: string;
  readonly repository?: string;
};

export const mountRequestFixture = ({
  id,
  mountId,
  provider = 'github',
  number,
  branch,
  state,
  host = 'github.com',
  repository = 'acme/api',
}: LinkFixtureParams): MountPullRequestLink => ({
  id,
  mountId,
  provider,
  host,
  repoSlug: repository,
  prNumber: number,
  headBranch: branch,
  baseBranch: 'main',
  url: `https://${host}/${repository}/requests/${number}`,
  state,
  snapshot: { number, state },
  lastObservedAt: RECOVERY_NOW,
  createdAt: RECOVERY_NOW,
  updatedAt: RECOVERY_NOW,
});

type SeriesFixtureParams = {
  readonly id?: string;
  readonly plannedCount?: number;
};

export const mountSeriesFixture = ({
  id = 'series-eng-3240',
  plannedCount = 6,
}: SeriesFixtureParams = {}): PrSeries => ({
  id: id as PrSeriesId,
  sessionId: RECOVERY_SESSION_ID,
  projectId: RECOVERY_PROJECT_ID,
  name: 'ENG-3240 split',
  workItemIdentifier: 'ENG-3240',
  workItemUrl: 'https://linear.example/ENG-3240',
  plannedCount,
  parentRequest: {
    provider: 'github',
    host: 'github.com',
    repoSlug: 'acme/api',
    prNumber: 90,
  },
  createdAt: RECOVERY_NOW,
  updatedAt: RECOVERY_NOW,
});

type MemberFixtureParams = {
  readonly seriesId: PrSeriesId;
  readonly position: number;
  readonly mountId?: MountId | null;
  readonly branch?: string | null;
  readonly status?: PrSeriesMember['status'];
};

export const mountSeriesMemberFixture = ({
  seriesId,
  position,
  mountId = null,
  branch = null,
  status = mountId === null ? 'planned' : 'active',
}: MemberFixtureParams): PrSeriesMember => ({
  id: `series-member-${position}` as PrSeriesMemberId,
  seriesId,
  mountId,
  branch,
  ordinal: position,
  label: `${position}/6`,
  status,
  createdAt: RECOVERY_NOW,
  updatedAt: RECOVERY_NOW,
});
