import { beforeEach, describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  PrSeries,
  PrSeriesId,
  PrSeriesMember,
  PrSeriesMemberId,
  ProjectId,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import { insertSessionWorktree } from './session-worktree';
import { upsertMountPullRequestLink } from './mount-pr-link';
import {
  findPrSeriesMembership,
  getPrSeries,
  insertPrSeries,
  listPrSeries,
  upsertPrSeriesMember,
} from './pr-series';

const workspaceId = 'workspace' as WorkspaceId;
const sessionId = 'session' as SessionId;
const projectId = 'project' as ProjectId;
const seriesId = 'series' as PrSeriesId;
const now = Date.parse('2026-09-08T10:00:00.000Z');
const iso = new Date(now).toISOString() as IsoDateTime;

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'Workspace', 'workspace', now, now],
  );
  await db.execute(
    `INSERT INTO projects (id, workspace_id, name, root_path, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [projectId, workspaceId, 'admin', '/repo/admin', 'repo', now, now],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, 'Split the restyle', 'idle', ?, ?)`,
    [sessionId, workspaceId, now, now],
  );
  return db;
};

const seedMount = async ({
  db,
  id,
  branch,
}: {
  readonly db: Database;
  readonly id: string;
  readonly branch: string;
}): Promise<MountId> => {
  await insertSessionWorktree(db, {
    id,
    sessionId,
    worktreePath: `/mount/${id}`,
    branch,
    parallelIndex: 0,
    projectId,
    repoSlug: 'acme/admin',
    createdAt: now,
  });
  return id as MountId;
};

const series = (overrides: Partial<PrSeries> = {}): PrSeries => ({
  id: seriesId,
  sessionId,
  projectId,
  name: 'restyle',
  workItemIdentifier: null,
  workItemUrl: null,
  plannedCount: 6,
  parentRequest: null,
  createdAt: iso,
  updatedAt: iso,
  ...overrides,
});

const member = (overrides: Partial<PrSeriesMember> = {}): PrSeriesMember => ({
  id: 'member' as PrSeriesMemberId,
  seriesId,
  mountId: null,
  branch: null,
  ordinal: 1,
  label: '1/6',
  status: 'planned',
  createdAt: iso,
  updatedAt: iso,
  ...overrides,
});

let db: Database;

beforeEach(async () => {
  db = await seed();
});

describe('pr series', () => {
  it('holds four created positions and two planned ones in one flat series', async () => {
    await insertPrSeries({ db, series: series() });
    const branches = [
      'ak/admin-ds-foundations',
      'ak/admin-patients-search-landing',
      'ak/admin-patient-header',
      'ak/admin-patient-paths',
    ];
    for (const [index, branch] of branches.entries()) {
      const mountId = await seedMount({ db, id: `mount-${index + 1}`, branch });
      await upsertPrSeriesMember({
        db,
        member: member({
          id: `created-${index + 1}` as PrSeriesMemberId,
          mountId,
          branch,
          ordinal: index + 1,
          label: `${index + 1}/6`,
          status: 'active',
        }),
      });
    }
    for (const ordinal of [5, 6]) {
      await upsertPrSeriesMember({
        db,
        member: member({
          id: `planned-${ordinal}` as PrSeriesMemberId,
          ordinal,
          label: `${ordinal}/6`,
        }),
      });
    }

    const [view] = await listPrSeries({ db, sessionId });

    expect(view?.members.map((entry) => entry.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view?.members.filter((entry) => entry.status === 'active')).toHaveLength(4);
    expect(view?.members.filter((entry) => entry.mountId === null)).toHaveLength(2);
  });

  it('keeps an explicitly supplied parent request as a provider identity', async () => {
    await insertPrSeries({
      db,
      series: series({
        parentRequest: {
          provider: 'github',
          host: 'github.com',
          repoSlug: 'acme/admin',
          prNumber: 190,
        },
      }),
    });

    const stored = await getPrSeries({ db, sessionId, seriesId });

    expect(stored?.parentRequest).toEqual({
      provider: 'github',
      host: 'github.com',
      repoSlug: 'acme/admin',
      prNumber: 190,
    });
  });

  it('refuses a second member at a position the series already fills', async () => {
    await insertPrSeries({ db, series: series() });
    await upsertPrSeriesMember({ db, member: member({ ordinal: 3, id: 'a' as PrSeriesMemberId }) });

    await db
      .execute(
        `INSERT INTO pr_series_members
        (id, series_id, mount_id, branch, ordinal, label, status, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 3, '3/6', 'planned', ?, ?)`,
        ['b', seriesId, now, now],
      )
      .then(
        () => expect.unreachable('a duplicate ordinal must not land'),
        (error: unknown) => expect(String(error)).toMatch(/UNIQUE|constraint/i),
      );
  });

  it('refuses a position that is not a positive number', async () => {
    await insertPrSeries({ db, series: series() });

    await upsertPrSeriesMember({ db, member: member({ ordinal: 0 }) }).then(
      () => expect.unreachable('a zero position must not land'),
      (error: unknown) => expect(String(error)).toMatch(/constraint/i),
    );
  });

  it('resolves the request of a member through its mount and its branch snapshot', async () => {
    await insertPrSeries({ db, series: series() });
    const mountId = await seedMount({ db, id: 'mount-1', branch: 'ak/admin-patient-header' });
    await upsertMountPullRequestLink({
      db,
      sessionId,
      link: {
        id: 'link-1',
        mountId,
        provider: 'github',
        host: 'github.com',
        repoSlug: 'acme/admin',
        prNumber: 212,
        headBranch: 'ak/admin-patient-header',
        baseBranch: 'main',
        url: 'https://github.com/acme/admin/pull/212',
        state: 'open',
        snapshot: null,
        lastObservedAt: iso,
        createdAt: iso,
        updatedAt: iso,
      },
    });
    await upsertPrSeriesMember({
      db,
      member: member({
        mountId,
        branch: 'ak/admin-patient-header',
        ordinal: 3,
        label: '3/6',
        status: 'active',
      }),
    });

    const [view] = await listPrSeries({ db, sessionId });

    expect(view?.members[0]?.request?.prNumber).toBe(212);
  });

  it('keeps an earlier membership on its own branch after the mount switches away', async () => {
    await insertPrSeries({ db, series: series() });
    const mountId = await seedMount({ db, id: 'mount-1', branch: 'ak/admin-patient-header' });
    await upsertPrSeriesMember({
      db,
      member: member({
        mountId,
        branch: 'ak/admin-patient-header',
        ordinal: 3,
        label: '3/6',
        status: 'active',
      }),
    });

    await db.execute('UPDATE session_worktrees SET branch = ? WHERE id = ?', [
      'ak/admin-patient-paths',
      mountId,
    ]);
    const [view] = await listPrSeries({ db, sessionId });

    expect(view?.members[0]?.branch).toBe('ak/admin-patient-header');
    expect(view?.members[0]?.ordinal).toBe(3);
  });

  it('leaves an omitted position out of the branches a creation consults', async () => {
    await insertPrSeries({ db, series: series() });
    const mountId = await seedMount({ db, id: 'mount-1', branch: 'ak/admin-patient-header' });
    await upsertPrSeriesMember({
      db,
      member: member({
        mountId,
        branch: 'ak/admin-patient-header',
        ordinal: 3,
        label: '3/6',
        status: 'omitted',
      }),
    });

    const membership = await findPrSeriesMembership({
      db,
      sessionId,
      mountId,
      branch: 'ak/admin-patient-header',
    });

    expect(membership).toBeNull();
  });

  it('finds the series a mount and branch belong to', async () => {
    await insertPrSeries({ db, series: series({ workItemIdentifier: 'ENG-3240' }) });
    const mountId = await seedMount({ db, id: 'mount-1', branch: 'ak/admin-patient-header' });
    await upsertPrSeriesMember({
      db,
      member: member({
        mountId,
        branch: 'ak/admin-patient-header',
        ordinal: 3,
        label: '3/6',
        status: 'active',
      }),
    });

    const membership = await findPrSeriesMembership({
      db,
      sessionId,
      mountId,
      branch: 'ak/admin-patient-header',
    });

    expect(membership?.series.workItemIdentifier).toBe('ENG-3240');
    expect(membership?.member.ordinal).toBe(3);
  });
});
