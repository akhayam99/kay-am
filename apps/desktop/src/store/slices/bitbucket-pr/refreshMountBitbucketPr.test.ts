import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  ProjectId,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { BitbucketPullRequest } from '../../../features/integrations/bitbucket/client';

const h = vi.hoisted(() => ({
  forBranch: vi.fn(),
  getPr: vi.fn(),
  approve: vi.fn(),
  remoteUrl: vi.fn(async (repoRoot: string) => `git@bitbucket.org:acme${repoRoot}.git`),
  links: [] as Array<MountPullRequestLink>,
}));

vi.mock('../../../features/integrations/bitbucket/client', () => ({
  bitbucketPullRequestForBranch: h.forBranch,
  bitbucketGetPullRequest: h.getPr,
  bitbucketApprovePullRequest: h.approve,
}));

vi.mock('../../../features/worktree/worktree', () => ({
  worktreeRemoteUrl: h.remoteUrl,
}));

vi.mock('@goodboy/db', () => ({
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

import { approveBitbucketPr } from './approveBitbucketPr';
import { refreshSessionBitbucketPr } from './refreshSessionBitbucketPr';
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
  repoRoot = '/rocket',
  branch,
  revision = 1,
}: MountParams): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId,
  mountName: 'rocket',
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

type PrParams = {
  readonly id: number;
  readonly branch: string;
  readonly state?: BitbucketPullRequest['state'];
  readonly webUrl?: string | null;
};

const makePr = ({ id, branch, state = 'OPEN', webUrl = null }: PrParams): BitbucketPullRequest => ({
  id,
  title: `pull request ${id}`,
  description: '',
  state,
  createdOn: '2026-09-01T10:00:00Z',
  updatedOn: '2026-09-01T11:00:00Z',
  sourceBranch: branch,
  sourceCommit: null,
  destinationBranch: 'main',
  destinationCommit: null,
  author: null,
  reviewers: [],
  participants: [],
  closeSourceBranch: false,
  mergeCommit: null,
  commentCount: 0,
  taskCount: 0,
  webUrl,
});

const harness = (mounts: ReadonlyArray<unknown>) => {
  const state: Record<string, unknown> = {
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, goal: 'ship it' }],
    workspaceIntegrations: {
      [WORKSPACE_ID]: [
        { provider: 'bitbucket', config: { workspaceSlug: 'acme', email: 'dev@acme.test' } },
      ],
    },
    sessionProjectMounts: {},
    sessionMounts: { [SESSION_ID]: mounts },
    sessionActiveMount: { [SESSION_ID]: M1 },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    mountBitbucketPr: {},
    mountSelectedBitbucketPr: {},
    sessionBitbucketPr: {},
    sessionBitbucketRepo: {},
    recordSessionEventOnce: vi.fn(async () => undefined),
  };
  const set = ((updater: unknown) => {
    const changes =
      typeof updater === 'function' ? (updater as (s: unknown) => object)(state) : updater;
    Object.assign(state, changes);
  }) as unknown as SetFn;
  const get = (() => state) as unknown as GetFn;
  state.refreshSessionBitbucketPr = refreshSessionBitbucketPr(set, get);
  return { state, set, get };
};

const mountPrOf = (state: Record<string, unknown>, mountId: MountId) =>
  (
    state.mountBitbucketPr as Record<
      string,
      {
        pr: BitbucketPullRequest | null;
        prs: ReadonlyArray<BitbucketPullRequest>;
        repository: string | null;
        error: string | null;
      }
    >
  )[mountId];

beforeEach(() => {
  h.links.length = 0;
  h.forBranch.mockReset();
  h.forBranch.mockResolvedValue(null);
  h.getPr.mockReset();
  h.approve.mockReset();
  h.remoteUrl.mockClear();
});

describe('refreshSessionBitbucketPr across mounts', () => {
  it('keeps a separate pull request on each branch of the same repository', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) =>
      sourceBranch === 'ak/part-one'
        ? makePr({ id: 11, branch: sourceBranch })
        : makePr({ id: 12, branch: sourceBranch }),
    );

    await refreshSessionBitbucketPr(set, get)(SESSION_ID);

    expect(mountPrOf(state, M1)?.pr?.id).toBe(11);
    expect(mountPrOf(state, M2)?.pr?.id).toBe(12);
    expect(h.links.map((link) => link.prNumber).sort()).toEqual([11, 12]);
  });

  it('does not collide on the same request number in two repositories', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/topic' }),
      mountView({
        id: M2,
        projectId: OTHER_PROJECT_ID,
        repoRoot: '/api',
        branch: 'ak/topic',
      }),
    ]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) =>
      makePr({ id: 42, branch: sourceBranch }),
    );

    await refreshSessionBitbucketPr(set, get)(SESSION_ID);

    expect(mountPrOf(state, M1)?.repository).toBe('acme/rocket');
    expect(mountPrOf(state, M2)?.repository).toBe('acme/api');
    expect(h.links.map((link) => link.repoSlug).sort()).toEqual(['acme/api', 'acme/rocket']);
  });

  it('keeps a provider failure on the mount that saw it', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) => {
      if (sourceBranch === 'ak/part-one') {
        throw new Error('bitbucket is down');
      }
      return makePr({ id: 12, branch: sourceBranch });
    });

    await refreshSessionBitbucketPr(set, get)(SESSION_ID);

    expect(mountPrOf(state, M1)?.error).toBe('bitbucket is down');
    expect(mountPrOf(state, M2)?.error).toBeNull();
    expect(mountPrOf(state, M2)?.pr?.id).toBe(12);
  });

  it('keeps polling the sibling mount after the other one merged', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) =>
      sourceBranch === 'ak/part-one'
        ? makePr({ id: 11, branch: sourceBranch, state: 'MERGED' })
        : makePr({ id: 12, branch: sourceBranch }),
    );

    await refreshSessionBitbucketPr(set, get)(SESSION_ID);
    h.forBranch.mockClear();
    await refreshSessionBitbucketPr(set, get)(SESSION_ID, { force: true });

    const branches = h.forBranch.mock.calls
      .map((call) => (call[0] as { sourceBranch: string }).sourceBranch)
      .sort();
    expect(branches).toEqual(['ak/part-one', 'ak/part-two']);
    expect(mountPrOf(state, M2)?.pr?.id).toBe(12);
  });

  it('restores each mount request from its persisted link after a restart', async () => {
    const first = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) =>
      sourceBranch === 'ak/part-one'
        ? makePr({ id: 11, branch: sourceBranch })
        : makePr({ id: 12, branch: sourceBranch }),
    );
    await refreshSessionBitbucketPr(first.set, first.get)(SESSION_ID);

    const restarted = harness([
      mountView({ id: M1, branch: 'ak/part-one-v2' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.forBranch.mockReset();
    h.forBranch.mockResolvedValue(null);

    await refreshSessionBitbucketPr(restarted.set, restarted.get)(SESSION_ID);

    expect(mountPrOf(restarted.state, M1)?.prs.map((pr) => pr.id)).toEqual([11]);
    expect(mountPrOf(restarted.state, M2)?.prs.map((pr) => pr.id)).toEqual([12]);
  });

  it('discards a branch fetch whose mount revision moved on while it was in flight', async () => {
    const { state, set, get } = harness([mountView({ id: M1, branch: 'ak/topic' })]);
    h.forBranch.mockImplementation(async ({ sourceBranch }: { readonly sourceBranch: string }) => {
      state.sessionMounts = {
        [SESSION_ID]: [mountView({ id: M1, branch: 'ak/other', revision: 2 })],
      };
      return makePr({ id: 11, branch: sourceBranch });
    });

    await refreshSessionBitbucketPr(set, get)(SESSION_ID);

    expect(mountPrOf(state, M1)?.pr ?? null).toBeNull();
  });
});

describe('bitbucket writes per mount', () => {
  it('re-reads the pull request it wrote to on the mount it was asked for', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.getPr.mockResolvedValue(makePr({ id: 12, branch: 'ak/part-two' }));

    await approveBitbucketPr(
      set,
      get,
    )({
      sessionId: SESSION_ID,
      mountId: M2,
      repo: {
        workspaceId: WORKSPACE_ID,
        workspaceSlug: 'acme',
        repoSlug: 'rocket',
        email: 'dev@acme.test',
      },
      pullRequestId: 12,
    });

    expect(h.getPr).toHaveBeenCalledWith(expect.objectContaining({ pullRequestId: 12 }));
    expect(h.forBranch).not.toHaveBeenCalled();
    expect(mountPrOf(state, M2)?.pr?.id).toBe(12);
    expect(mountPrOf(state, M1) ?? null).toBeNull();
  });

  it('leaves the active mount selection untouched when writing to a sibling', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.getPr.mockResolvedValue(makePr({ id: 12, branch: 'ak/part-two' }));

    await approveBitbucketPr(
      set,
      get,
    )({
      sessionId: SESSION_ID,
      mountId: M2,
      repo: {
        workspaceId: WORKSPACE_ID,
        workspaceSlug: 'acme',
        repoSlug: 'rocket',
        email: 'dev@acme.test',
      },
      pullRequestId: 12,
    });

    const selected = state.mountSelectedBitbucketPr as Record<string, { prNumber: number } | null>;
    expect(selected[M2]?.prNumber).toBe(12);
    expect(selected[M1] ?? null).toBeNull();
  });
});
