import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveSession,
  detachSessionMounts,
  insertPrSeries,
  insertSessionMount,
  listMountOperations,
  listMountPullRequestLinks,
  listPrSeries,
  listRetainedWorktreePaths,
  listSessionMounts,
  softDeleteSession,
  upsertMountOperation,
  upsertMountPullRequestLink,
  upsertPrSeriesMember,
  type Database,
} from '@goodboy/db';
import type { MountId, MountPullRequestLink, RetainedWorktreePath } from '@goodboy/types';
import { buildMountRows } from '../store/slices/project-mounts/mountRowModel';
import { seriesReferenceLines } from '../store/slices/pr-series/seriesReferences';
import {
  createMountRecoveryDatabase,
  mountRecoveryFixture,
  mountRequestFixture,
  mountSeriesFixture,
  mountSeriesMemberFixture,
  RECOVERY_NOW,
  RECOVERY_PROJECT_ID,
  RECOVERY_SESSION_ID,
  RECOVERY_WORKSPACE_ID,
} from './helpers/mountRecoveryDatabase';

let db: Database;

beforeEach(async () => {
  db = await createMountRecoveryDatabase();
});

const persistMountRequest = async ({ link }: { readonly link: MountPullRequestLink }) => {
  await upsertMountPullRequestLink({ db, sessionId: RECOVERY_SESSION_ID, link });
};

describe('mount recovery persistence', () => {
  it('restores a flat fan-out with request ownership and planned positions intact', async () => {
    const series = mountSeriesFixture();
    await insertPrSeries({ db, series });
    for (const position of [1, 2, 3, 4]) {
      const mount = mountRecoveryFixture({
        id: `mount-${position}`,
        branch: `feature/part-${position}`,
        position,
      });
      await insertSessionMount({ db, mount });
      const discovered = mountRequestFixture({
        id: `link-${position}`,
        mountId: mount.id,
        number: 100 + position,
        branch: mount.branch,
        state: 'draft',
      });
      await persistMountRequest({ link: discovered });
      await persistMountRequest({
        link: { ...discovered, state: position <= 2 ? 'merged' : 'open' },
      });
      await upsertPrSeriesMember({
        db,
        member: mountSeriesMemberFixture({
          seriesId: series.id,
          position,
          mountId: mount.id,
          branch: mount.branch,
        }),
      });
    }
    for (const position of [5, 6]) {
      await upsertPrSeriesMember({
        db,
        member: mountSeriesMemberFixture({ seriesId: series.id, position }),
      });
    }

    const mounts = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    const restoredSeries = await listPrSeries({ db, sessionId: RECOVERY_SESSION_ID });
    const links = (
      await Promise.all(
        mounts.map((mount) =>
          listMountPullRequestLinks({ db, sessionId: RECOVERY_SESSION_ID, mountId: mount.id }),
        ),
      )
    ).flat();
    const mountGithub = Object.fromEntries(
      links.map((link) => [
        link.mountId,
        {
          host: link.host,
          repository: link.repoSlug,
          pr: {
            number: link.prNumber,
            title: `Part ${link.prNumber}`,
            url: link.url,
            state: link.state,
            isDraft: link.state === 'draft',
          },
        },
      ]),
    );
    const [group] = buildMountRows({
      sessionId: RECOVERY_SESSION_ID,
      state: {
        projects: [
          {
            id: RECOVERY_PROJECT_ID,
            workspaceId: RECOVERY_WORKSPACE_ID,
            name: 'API',
            kind: 'repo',
            rootPath: '/repo/api',
          },
        ],
        sessionMounts: {
          [RECOVERY_SESSION_ID]: mounts.map((mount) => ({ ...mount, repoRoot: '/repo/api' })),
        },
        sessionProjectMounts: {},
        mountGithub,
        mountGitlabMr: {},
        mountBitbucketPr: {},
        mountBranchObservations: {},
        prSeries: { [RECOVERY_SESSION_ID]: restoredSeries },
      } as never,
    });

    expect(mounts.map((mount) => mount.baseBranch)).toEqual(Array(4).fill('origin/main'));
    expect(links.map((link) => link.prNumber)).toEqual([101, 102, 103, 104]);
    expect(restoredSeries[0]?.parentRequest?.prNumber).toBe(90);
    expect(restoredSeries[0]?.members.filter((member) => member.mountId === null)).toHaveLength(2);
    expect(group).toMatchObject({
      rows: [{ mountId: 'mount-3' }, { mountId: 'mount-4' }],
      completedRows: [{ mountId: 'mount-1' }, { mountId: 'mount-2' }],
      seriesProgress: '2 merged · 4 of 6 created',
    });
  });

  it('keeps the original draft beside a selected split and emits non-closing references', async () => {
    const original = mountRecoveryFixture({
      id: 'mount-original',
      branch: 'feature/eng-3240-draft',
      position: 0,
      path: '/repo/api/.goodboy/worktrees/original-draft',
    });
    const split = mountRecoveryFixture({
      id: 'mount-split',
      branch: 'feature/eng-3240-auth',
      position: 1,
    });
    const series = mountSeriesFixture({ plannedCount: 2 });
    await insertSessionMount({ db, mount: original });
    await insertSessionMount({ db, mount: split });
    await persistMountRequest({
      link: mountRequestFixture({
        id: 'draft-original',
        mountId: original.id,
        number: 90,
        branch: original.branch,
        state: 'draft',
      }),
    });
    await persistMountRequest({
      link: mountRequestFixture({
        id: 'draft-split',
        mountId: split.id,
        number: 91,
        branch: split.branch,
        state: 'draft',
      }),
    });
    await insertPrSeries({ db, series });
    const member = mountSeriesMemberFixture({
      seriesId: series.id,
      position: 1,
      mountId: split.id,
      branch: split.branch,
    });
    await upsertPrSeriesMember({ db, member });

    const restored = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    const requests = await Promise.all(
      restored.map((mount) =>
        listMountPullRequestLinks({ db, sessionId: RECOVERY_SESSION_ID, mountId: mount.id }),
      ),
    );

    expect(restored[0]).toMatchObject({
      branch: 'feature/eng-3240-draft',
      worktreePath: '/repo/api/.goodboy/worktrees/original-draft',
    });
    expect(requests.flat().map((link) => link.prNumber)).toEqual([90, 91]);
    expect(seriesReferenceLines({ series, member, body: '' })).toEqual([
      'Part of ENG-3240',
      'ENG-3240 split 1/2',
    ]);
  });

  it('retains independent provider identities for the same project mount', async () => {
    const mount = mountRecoveryFixture({
      id: 'mount-parity',
      branch: 'feature/parity',
      position: 1,
    });
    await insertSessionMount({ db, mount });
    await persistMountRequest({
      link: mountRequestFixture({
        id: 'github-link',
        mountId: mount.id,
        provider: 'github',
        host: 'github.com',
        number: 12,
        branch: mount.branch,
        state: 'open',
      }),
    });
    await persistMountRequest({
      link: mountRequestFixture({
        id: 'gitlab-link',
        mountId: mount.id,
        provider: 'gitlab',
        host: 'gitlab.example',
        repository: 'platform/api',
        number: 12,
        branch: mount.branch,
        state: 'open',
      }),
    });
    await persistMountRequest({
      link: mountRequestFixture({
        id: 'bitbucket-link',
        mountId: mount.id,
        provider: 'bitbucket',
        host: 'bitbucket.example',
        repository: 'platform/api',
        number: 12,
        branch: mount.branch,
        state: 'open',
      }),
    });

    const links = await listMountPullRequestLinks({
      db,
      sessionId: RECOVERY_SESSION_ID,
      mountId: mount.id,
    });

    expect(links.map((link) => [link.provider, link.host, link.repoSlug])).toEqual([
      ['bitbucket', 'bitbucket.example', 'platform/api'],
      ['github', 'github.com', 'acme/api'],
      ['gitlab', 'gitlab.example', 'platform/api'],
    ]);
  });

  it('tracks dirty retained work through archive and soft delete without losing ownership', async () => {
    const mount = mountRecoveryFixture({ id: 'mount-dirty', branch: 'feature/dirty', position: 1 });
    await insertSessionMount({ db, mount });
    const link = mountRequestFixture({
      id: 'dirty-link',
      mountId: mount.id,
      number: 44,
      branch: mount.branch,
      state: 'open',
    });
    await persistMountRequest({ link });
    await upsertMountOperation({
      db,
      operation: {
        id: 'operation-dirty',
        sessionId: RECOVERY_SESSION_ID,
        mountId: mount.id,
        requestId: 'delete-dirty',
        kind: 'retain',
        status: 'succeeded',
        expectedRevision: 0,
        input: { reason: 'untracked-files' },
        result: null,
        errorCode: null,
        createdAt: RECOVERY_NOW,
        updatedAt: RECOVERY_NOW,
      },
    });
    const retained: RetainedWorktreePath = {
      id: 'retained-dirty',
      workspaceId: RECOVERY_WORKSPACE_ID,
      projectId: RECOVERY_PROJECT_ID,
      sourceSessionId: RECOVERY_SESSION_ID,
      sourceMountId: mount.id,
      repoRoot: '/repo/api',
      worktreePath: mount.worktreePath ?? '',
      branch: mount.branch,
      reason: 'session_delete',
      lastCheckedAt: null,
      createdAt: RECOVERY_NOW,
      updatedAt: RECOVERY_NOW,
    };

    await archiveSession(db, RECOVERY_SESSION_ID);
    await detachSessionMounts({
      db,
      sessionId: RECOVERY_SESSION_ID,
      detached: [{ mountId: mount.id, diskState: 'present' }],
      retained: [retained],
    });
    await softDeleteSession(db, RECOVERY_SESSION_ID);

    expect(await listRetainedWorktreePaths({ db, workspaceId: RECOVERY_WORKSPACE_ID })).toEqual([
      retained,
    ]);
    expect(
      await listMountPullRequestLinks({ db, sessionId: RECOVERY_SESSION_ID, mountId: mount.id }),
    ).toEqual([link]);
    expect(await listMountOperations({ db, sessionId: RECOVERY_SESSION_ID })).toHaveLength(1);
    expect(await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID })).toEqual([
      expect.objectContaining({
        id: 'mount-dirty',
        worktreePath: null,
        lastWorktreePath: retained.worktreePath,
        diskState: 'present',
      }),
    ]);
  });
});
