import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, PrSeriesId, ProjectId, SessionId } from '@goodboy/types';

type SeriesRow = {
  id: string;
  sessionId: string;
  projectId: string;
  name: string;
  workItemIdentifier: string | null;
  workItemUrl: string | null;
  plannedCount: number | null;
  parentRequest: unknown;
  createdAt: string;
  updatedAt: string;
};

type MemberRow = {
  id: string;
  seriesId: string;
  mountId: string | null;
  branch: string | null;
  ordinal: number;
  label: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const h = vi.hoisted(() => {
  const series = new Map<string, SeriesRow>();
  const members = new Map<string, MemberRow>();
  return { series, members };
});

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('@goodboy/db', () => ({
  insertPrSeries: vi.fn(async ({ series }: { series: SeriesRow }) => {
    h.series.set(series.id, { ...series });
  }),
  getPrSeries: vi.fn(
    async ({ sessionId, seriesId }: { sessionId: string; seriesId: string }) =>
      [...h.series.values()].find((row) => row.id === seriesId && row.sessionId === sessionId) ??
      null,
  ),
  listPrSeries: vi.fn(async ({ sessionId, projectId }: { sessionId: string; projectId?: string }) =>
    [...h.series.values()]
      .filter((row) => row.sessionId === sessionId)
      .filter((row) => projectId === undefined || row.projectId === projectId)
      .map((row) => ({
        ...row,
        members: [...h.members.values()]
          .filter((entry) => entry.seriesId === row.id)
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((entry) => ({ ...entry, request: null })),
      })),
  ),
  listPrSeriesMembers: vi.fn(async ({ seriesId }: { seriesId: string }) =>
    [...h.members.values()]
      .filter((entry) => entry.seriesId === seriesId)
      .sort((a, b) => a.ordinal - b.ordinal),
  ),
  upsertPrSeriesMember: vi.fn(async ({ member }: { member: MemberRow }) => {
    const previous = [...h.members.values()].find(
      (entry) => entry.seriesId === member.seriesId && entry.ordinal === member.ordinal,
    );
    if (previous !== undefined) {
      h.members.delete(previous.id);
    }
    h.members.set(member.id, { ...member });
  }),
}));

import { createPrSeriesSlice } from './index';
import { resolveParentRequest } from './parentRequest';
import { seriesReferenceLines } from './seriesReferences';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const OTHER_PROJECT_ID = 'project-2' as ProjectId;
const SERIES_ID = 'series-1' as PrSeriesId;

type State = Record<string, unknown>;

const mountView = ({ id, branch }: { readonly id: string; readonly branch: string }): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  mountName: 'admin',
  worktreePath: `/mount/${id}`,
  lastWorktreePath: `/mount/${id}`,
  repoRoot: '/repo/admin',
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: 'acme/admin',
  isAttached: true,
  diskState: 'present',
  revision: 0,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
});

const makeSlice = () => {
  const state: State = {
    sessions: [{ id: SESSION_ID, workspaceId: 'workspace-1', goal: 'Split the restyle' }],
    archivedSessions: {},
    projects: [
      { id: PROJECT_ID, workspaceId: 'workspace-1', kind: 'repo', name: 'admin', overrides: {} },
      {
        id: OTHER_PROJECT_ID,
        workspaceId: 'workspace-1',
        kind: 'repo',
        name: 'web',
        overrides: {},
      },
    ],
    prSeries: {},
    sessionMounts: {
      [SESSION_ID]: [
        mountView({ id: 'mount-1', branch: 'ak/admin-ds-foundations' }),
        mountView({ id: 'mount-2', branch: 'ak/admin-patient-header' }),
      ],
    },
  };
  const set = vi.fn((updater: Partial<State> | ((current: State) => Partial<State>)) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    Object.assign(state, patch);
  });
  const slice = createPrSeriesSlice(set as never, (() => state) as never);
  return { state, slice };
};

const seedSeries = ({ plannedCount }: { readonly plannedCount: number | null }): void => {
  h.series.set(SERIES_ID, {
    id: SERIES_ID,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    name: 'restyle',
    workItemIdentifier: 'ENG-3240',
    workItemUrl: null,
    plannedCount,
    parentRequest: null,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  });
};

beforeEach(() => {
  h.series.clear();
  h.members.clear();
});

describe('pr series grouping', () => {
  it('records the planned total of a six part split', async () => {
    const { slice, state } = makeSlice();

    const series = await slice.createPrSeries({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      name: 'restyle',
      plannedCount: 6,
      workItemIdentifier: 'ENG-3240',
    });

    expect(series.plannedCount).toBe(6);
    expect(series.name).toBe('restyle');
    expect((state['prSeries'] as Record<string, ReadonlyArray<unknown>>)[SESSION_ID]).toHaveLength(
      1,
    );
  });

  it('refuses a second series with the same name in the same project', async () => {
    const { slice } = makeSlice();
    await slice.createPrSeries({ sessionId: SESSION_ID, projectId: PROJECT_ID, name: 'restyle' });

    await expect(
      slice.createPrSeries({ sessionId: SESSION_ID, projectId: PROJECT_ID, name: 'restyle' }),
    ).rejects.toThrow(/already groups a series/);
  });

  it('snapshots the branch of the mount it puts at a position', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();

    const member = await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      mountId: 'mount-2' as MountId,
    });

    expect(member.branch).toBe('ak/admin-patient-header');
    expect(member.status).toBe('active');
    expect(member.label).toBe('3/6');
  });

  it('keeps an earlier position on its own branch when the mount switches away', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice, state } = makeSlice();
    await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      mountId: 'mount-2' as MountId,
    });

    state['sessionMounts'] = {
      [SESSION_ID]: [mountView({ id: 'mount-2', branch: 'ak/admin-patient-paths' })],
    };
    const views = await slice.loadPrSeries({ sessionId: SESSION_ID });

    expect(views[0]?.members[0]?.branch).toBe('ak/admin-patient-header');
  });

  it('refuses to hand a filled position to another mount', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();
    await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      mountId: 'mount-2' as MountId,
    });

    await expect(
      slice.setPrSeriesMember({
        sessionId: SESSION_ID,
        seriesId: SERIES_ID,
        position: 3,
        mountId: 'mount-1' as MountId,
      }),
    ).rejects.toThrow(/already names mount/);
  });

  it('refuses the same mount and branch at two positions of one series', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();
    await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      mountId: 'mount-2' as MountId,
    });

    await expect(
      slice.setPrSeriesMember({
        sessionId: SESSION_ID,
        seriesId: SERIES_ID,
        position: 4,
        mountId: 'mount-2' as MountId,
      }),
    ).rejects.toThrow(/already holds position 3/);
  });

  it('refuses a position outside the planned total', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();

    await expect(
      slice.setPrSeriesMember({ sessionId: SESSION_ID, seriesId: SERIES_ID, position: 7 }),
    ).rejects.toThrow(/outside it/);
  });

  it('leaves a planned position without a mount or a directory', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();

    const member = await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 5,
    });

    expect(member.mountId).toBeNull();
    expect(member.status).toBe('planned');
  });

  it('marks a member omitted while keeping the mount it already named', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();
    await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      mountId: 'mount-2' as MountId,
    });

    const member = await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 3,
      isOmitted: true,
    });

    expect(member.status).toBe('omitted');
    expect(member.mountId).toBe('mount-2');
  });

  it('preserves a supplied label exactly as it was typed', async () => {
    seedSeries({ plannedCount: 6 });
    const { slice } = makeSlice();

    const member = await slice.setPrSeriesMember({
      sessionId: SESSION_ID,
      seriesId: SERIES_ID,
      position: 2,
      label: 'restyle 2/6 (patients search landing)',
    });

    expect(member.label).toBe('restyle 2/6 (patients search landing)');
  });
});

describe('an explicitly supplied parent request', () => {
  it('reads a complete provider identity', () => {
    expect(
      resolveParentRequest({
        provider: 'github',
        host: 'github.com',
        repo: 'acme/admin',
        number: 190,
      }),
    ).toEqual({
      provider: 'github',
      host: 'github.com',
      repoSlug: 'acme/admin',
      prNumber: 190,
    });
  });

  it('stays absent when nothing was supplied', () => {
    expect(resolveParentRequest({})).toBeNull();
  });

  it('refuses a half named parent', () => {
    expect(() => resolveParentRequest({ provider: 'github', number: 190 })).toThrow(/needs all of/);
  });

  it('refuses a provider Goodboy cannot address', () => {
    expect(() =>
      resolveParentRequest({
        provider: 'sourcehut',
        host: 'git.sr.ht',
        repo: 'acme/admin',
        number: 190,
      }),
    ).toThrow(/Unknown parent provider/);
  });
});

describe('the lines a series adds to a generated description', () => {
  it('names the work item and the position of the member', () => {
    seedSeries({ plannedCount: 6 });
    const series = h.series.get(SERIES_ID);

    const lines = seriesReferenceLines({
      series: series as never,
      member: { ordinal: 3 } as never,
      body: 'Splits the header out.',
    });

    expect(lines).toEqual(['Part of ENG-3240', 'restyle 3/6']);
  });

  it('adds nothing a body already carries', () => {
    seedSeries({ plannedCount: 6 });
    const series = h.series.get(SERIES_ID);

    const lines = seriesReferenceLines({
      series: series as never,
      member: { ordinal: 3 } as never,
      body: 'Part of ENG-3240, restyle 3/6, built on main.',
    });

    expect(lines).toEqual([]);
  });
});
