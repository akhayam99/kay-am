import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  ProjectId,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { GitlabMergeRequest } from '../../../features/integrations/gitlab/client';

type ForBranch = (
  workspaceId: WorkspaceId,
  host: string,
  projectPath: string,
  branch: string,
) => Promise<GitlabMergeRequest | null>;

const h = vi.hoisted(() => ({
  mrForBranch: vi.fn(),
  createMr: vi.fn(),
  mergeMr: vi.fn(),
  remoteUrl: vi.fn(async (repoRoot: string) => `git@gitlab.com:acme${repoRoot}.git`),
  links: [] as Array<MountPullRequestLink>,
}));

vi.mock('../../../features/integrations/gitlab/client', () => ({
  gitlabMrForBranch: h.mrForBranch,
  gitlabCreateMr: h.createMr,
  gitlabMergeMr: h.mergeMr,
}));

vi.mock('../../../features/worktree/worktree', () => ({
  worktreeRemoteUrl: h.remoteUrl,
}));

vi.mock('@goodboy/db', () => ({
  findPrSeriesMembership: vi.fn(async () => null),
  listMountPullRequestLinks: vi.fn(async ({ mountId }: { readonly mountId: MountId }) =>
    h.links.filter((link) => link.mountId === mountId),
  ),
  upsertMountPullRequestLink: vi.fn(async ({ link }: { readonly link: MountPullRequestLink }) => {
    const index = h.links.findIndex(
      (candidate) =>
        candidate.mountId === link.mountId &&
        candidate.host === link.host &&
        candidate.repoSlug === link.repoSlug &&
        candidate.prNumber === link.prNumber,
    );
    if (index >= 0) {
      h.links.splice(index, 1, link);
    } else {
      h.links.push(link);
    }
    return true;
  }),
}));

vi.mock('@goodboy/ui', () => ({
  formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import { createMrForSession } from './createMrForSession';
import { refreshSessionMr } from './refreshSessionMr';
import type { GetFn, SetFn } from './types';

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const OTHER_PROJECT_ID = 'project-2' as ProjectId;
const M1 = 'mount-1' as MountId;
const M2 = 'mount-2' as MountId;

type MountParams = {
  readonly id: MountId;
  readonly projectId?: ProjectId;
  readonly repoRoot?: string;
  readonly branch: string;
  readonly revision?: number;
};

const mountView = ({
  id,
  projectId = PROJECT_ID,
  repoRoot = '/web',
  branch,
  revision = 1,
}: MountParams): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId,
  mountName: 'web',
  worktreePath: `${repoRoot}/.goodboy/worktrees/${id}`,
  lastWorktreePath: null,
  repoRoot,
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: null,
  isAttached: true,
  diskState: 'present',
  revision,
  createdAt: '2026-09-01T00:00:00.000Z' as IsoDateTime,
  updatedAt: '2026-09-01T00:00:00.000Z' as IsoDateTime,
});

type MrParams = {
  readonly iid: number;
  readonly branch: string;
  readonly projectPath?: string;
  readonly state?: string;
};

const makeMr = ({
  iid,
  branch,
  projectPath = 'acme/web',
  state = 'opened',
}: MrParams): GitlabMergeRequest =>
  ({
    id: iid * 100,
    iid,
    projectId: 1,
    title: `mr ${iid}`,
    description: null,
    state,
    webUrl: `https://gitlab.com/${projectPath}/-/merge_requests/${iid}`,
    sourceBranch: branch,
    targetBranch: 'main',
    draft: false,
    hasConflicts: false,
    mergeStatus: 'can_be_merged',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }) as GitlabMergeRequest;

const harness = (mounts: ReadonlyArray<unknown>) => {
  const state: Record<string, unknown> = {
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, goal: 'ship it' }],
    projects: [{ id: PROJECT_ID }, { id: OTHER_PROJECT_ID }],
    workspaceIntegrations: {
      [WORKSPACE_ID]: [{ provider: 'gitlab', config: { host: 'gitlab.com' } }],
    },
    sessionProjectMounts: {},
    sessionMounts: { [SESSION_ID]: mounts },
    sessionActiveMount: { [SESSION_ID]: M1 },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    mountGitlabMr: {},
    sessionGitlabMr: {},
    recordSessionEventOnce: vi.fn(async () => undefined),
    emitNotification: vi.fn(async () => undefined),
  };
  const set = ((updater: unknown) => {
    const changes =
      typeof updater === 'function' ? (updater as (s: unknown) => object)(state) : updater;
    Object.assign(state, changes);
  }) as unknown as SetFn;
  const get = (() => state) as unknown as GetFn;
  state.refreshSessionMr = refreshSessionMr(set, get);
  return { state, set, get };
};

const mountMrOf = (state: Record<string, unknown>, mountId: MountId) =>
  (
    state.mountGitlabMr as Record<
      string,
      {
        mr: GitlabMergeRequest | null;
        mrs: ReadonlyArray<GitlabMergeRequest>;
        error: string | null;
      }
    >
  )[mountId];

beforeEach(() => {
  h.links.length = 0;
  h.mrForBranch.mockReset();
  h.mrForBranch.mockResolvedValue(null);
  h.createMr.mockReset();
  h.mergeMr.mockReset();
  h.remoteUrl.mockClear();
});

describe('refreshSessionMr across mounts', () => {
  it('keeps a separate merge request on each branch of the same project', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) =>
      branch === 'ak/part-one'
        ? makeMr({ iid: 11, branch })
        : makeMr({ iid: 12, branch })) as ForBranch);

    await refreshSessionMr(set, get)(SESSION_ID);

    expect(mountMrOf(state, M1)?.mr?.iid).toBe(11);
    expect(mountMrOf(state, M2)?.mr?.iid).toBe(12);
    expect(h.links.map((link) => link.prNumber).sort()).toEqual([11, 12]);
  });

  it('does not collide on the same request number in two projects', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/topic' }),
      mountView({
        id: M2,
        projectId: OTHER_PROJECT_ID,
        repoRoot: '/api',
        branch: 'ak/topic',
      }),
    ]);
    h.mrForBranch.mockImplementation((async (_ws, _host, projectPath, branch) =>
      makeMr({ iid: 42, branch, projectPath })) as ForBranch);

    await refreshSessionMr(set, get)(SESSION_ID);

    expect(mountMrOf(state, M1)?.mr?.webUrl).toContain('acme/web');
    expect(mountMrOf(state, M2)?.mr?.webUrl).toContain('acme/api');
    expect(h.links.map((link) => link.repoSlug).sort()).toEqual(['acme/api', 'acme/web']);
  });

  it('keeps a provider failure on the mount that saw it', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) => {
      if (branch === 'ak/part-one') {
        throw new Error('gitlab token expired');
      }
      return makeMr({ iid: 12, branch });
    }) as ForBranch);

    await refreshSessionMr(set, get)(SESSION_ID);

    expect(mountMrOf(state, M1)?.error).toBe('gitlab token expired');
    expect(mountMrOf(state, M2)?.error).toBeNull();
    expect(mountMrOf(state, M2)?.mr?.iid).toBe(12);
  });

  it('keeps polling the sibling mount after the other one merged', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) =>
      branch === 'ak/part-one'
        ? makeMr({ iid: 11, branch, state: 'merged' })
        : makeMr({ iid: 12, branch })) as ForBranch);

    await refreshSessionMr(set, get)(SESSION_ID);
    h.mrForBranch.mockClear();
    await refreshSessionMr(set, get)(SESSION_ID, { force: true });

    const branches = h.mrForBranch.mock.calls.map((call) => call[3]).sort();
    expect(branches).toEqual(['ak/part-one', 'ak/part-two']);
    expect(mountMrOf(state, M2)?.mr?.iid).toBe(12);
  });

  it('restores each mount request from its persisted link after a restart', async () => {
    const first = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) =>
      branch === 'ak/part-one'
        ? makeMr({ iid: 11, branch })
        : makeMr({ iid: 12, branch })) as ForBranch);
    await refreshSessionMr(first.set, first.get)(SESSION_ID);

    const restarted = harness([
      mountView({ id: M1, branch: 'ak/part-one-v2' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.mrForBranch.mockResolvedValue(null);

    await refreshSessionMr(restarted.set, restarted.get)(SESSION_ID);

    expect(mountMrOf(restarted.state, M1)?.mrs.map((mr) => mr.iid)).toEqual([11]);
    expect(mountMrOf(restarted.state, M2)?.mrs.map((mr) => mr.iid)).toEqual([12]);
  });

  it('discards a branch fetch whose mount revision moved on while it was in flight', async () => {
    const { state, set, get } = harness([mountView({ id: M1, branch: 'ak/topic' })]);
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) => {
      state.sessionMounts = {
        [SESSION_ID]: [mountView({ id: M1, branch: 'ak/other', revision: 2 })],
      };
      return makeMr({ iid: 11, branch });
    }) as ForBranch);

    await refreshSessionMr(set, get)(SESSION_ID);

    expect(mountMrOf(state, M1)?.mr ?? null).toBeNull();
  });
});

describe('createMrForSession per mount', () => {
  it('creates the merge request on the mount it was asked for, not the active one', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.createMr.mockResolvedValue(makeMr({ iid: 12, branch: 'ak/part-two' }));
    h.mrForBranch.mockImplementation((async (_ws, _host, _path, branch) =>
      branch === 'ak/part-two' ? makeMr({ iid: 12, branch }) : null) as ForBranch);

    await createMrForSession(set, get)({ sessionId: SESSION_ID, mountId: M2 });

    expect(h.createMr).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBranch: 'ak/part-two', projectPath: 'acme/web' }),
    );
    expect(mountMrOf(state, M2)?.mr?.iid).toBe(12);
    expect(mountMrOf(state, M1)?.mr ?? null).toBeNull();
  });

  it('records the creation once against the mount that owns it', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.createMr.mockResolvedValue(makeMr({ iid: 12, branch: 'ak/part-two' }));

    await createMrForSession(set, get)({ sessionId: SESSION_ID, mountId: M2 });

    const record = state.recordSessionEventOnce as ReturnType<typeof vi.fn>;
    expect(record.mock.calls.map((call) => (call[0] as { kind: string }).kind)).toEqual([
      'pr_created',
    ]);
    expect((record.mock.calls[0]?.[0] as { payload: { mountId: string } }).payload.mountId).toBe(
      M2,
    );
  });
});
