import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  ProjectId,
  PullRequestState,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';

type ListPrs = (
  runner: unknown,
  repo: string,
  branch: string,
  opts: Readonly<Record<string, unknown>>,
) => Promise<ReadonlyArray<PullRequestState>>;

const h = vi.hoisted(() => ({
  detectRepoSlug: vi.fn(async () => null as string | null),
  listPrsForBranch: vi.fn<ListPrs>(async () => []),
  fetchLinkedIssues: vi.fn(async () => []),
  links: [] as Array<MountPullRequestLink>,
}));

vi.mock('@goodboy/core', () => ({
  detectRepoSlug: h.detectRepoSlug,
  listPrsForBranch: h.listPrsForBranch,
  fetchLinkedIssues: h.fetchLinkedIssues,
  toCachedPullRequest: vi.fn(() => null),
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
  upsertGithubPrCache: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/ui', () => ({
  formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock('../../../features/github/github', () => ({
  tauriGhRunner: { run: vi.fn() },
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import { refreshSessionPr } from './refreshSessionPr';
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
  readonly branch: string;
  readonly repoSlug?: string | null;
  readonly revision?: number;
};

const mountView = ({
  id,
  projectId = PROJECT_ID,
  branch,
  repoSlug = 'acme/web',
  revision = 1,
}: MountParams): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId,
  mountName: 'repo',
  worktreePath: `/repo/.goodboy/worktrees/${id}`,
  lastWorktreePath: null,
  repoRoot: '/repo',
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug,
  isAttached: true,
  diskState: 'present',
  revision,
  createdAt: '2026-09-01T00:00:00.000Z' as IsoDateTime,
  updatedAt: '2026-09-01T00:00:00.000Z' as IsoDateTime,
});

type PrParams = {
  readonly number: number;
  readonly repo?: string;
  readonly branch: string;
  readonly state?: PullRequestState['state'];
};

const makePr = ({
  number,
  repo = 'acme/web',
  branch,
  state = 'open',
}: PrParams): PullRequestState =>
  ({
    number,
    title: `pr ${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    state,
    mergeable: true,
    checks: 'success',
    baseBranch: 'main',
    headBranch: branch,
    isDraft: false,
    reviewDecision: null,
    body: '',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }) as PullRequestState;

const harness = (mounts: ReadonlyArray<unknown>) => {
  const state: Record<string, unknown> = {
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }],
    projects: [{ id: PROJECT_ID }, { id: OTHER_PROJECT_ID }],
    sessionProjectMounts: {},
    sessionMounts: { [SESSION_ID]: mounts },
    sessionActiveMount: { [SESSION_ID]: M1 },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    mountGithub: {},
    mountSelectedPr: {},
    sessionGithub: {},
    sessionProjectPrs: {},
    sessionSelectedPrNumber: {},
    recordSessionEventOnce: vi.fn(async () => undefined),
  };
  const set = ((updater: unknown) => {
    const changes =
      typeof updater === 'function' ? (updater as (s: unknown) => object)(state) : updater;
    Object.assign(state, changes);
  }) as unknown as SetFn;
  const get = (() => state) as unknown as GetFn;
  return { state, set, get };
};

const mountGithubOf = (state: Record<string, unknown>, mountId: MountId) =>
  (
    state.mountGithub as Record<
      string,
      {
        prs: ReadonlyArray<PullRequestState>;
        pr: PullRequestState | null;
        error: string | null;
        failedAt: string | null;
      }
    >
  )[mountId];

beforeEach(() => {
  h.links.length = 0;
  h.detectRepoSlug.mockReset();
  h.detectRepoSlug.mockResolvedValue(null);
  h.listPrsForBranch.mockReset();
  h.listPrsForBranch.mockResolvedValue([]);
  h.fetchLinkedIssues.mockReset();
  h.fetchLinkedIssues.mockResolvedValue([]);
});

describe('refreshSessionPr across mounts', () => {
  it('keeps a separate pull request on each branch of the same repository', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.listPrsForBranch.mockImplementation(async (_runner, _repo, branch) =>
      branch === 'ak/part-one'
        ? [makePr({ number: 11, branch })]
        : [makePr({ number: 12, branch })],
    );

    await refreshSessionPr(set, get)(SESSION_ID);

    expect(mountGithubOf(state, M1)?.pr?.number).toBe(11);
    expect(mountGithubOf(state, M2)?.pr?.number).toBe(12);
    expect(h.links.map((link) => link.prNumber).sort()).toEqual([11, 12]);
  });

  it('restores each mount request from its persisted link after a restart', async () => {
    const first = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.listPrsForBranch.mockImplementation(async (_runner, _repo, branch) =>
      branch === 'ak/part-one'
        ? [makePr({ number: 11, branch })]
        : [makePr({ number: 12, branch })],
    );
    await refreshSessionPr(first.set, first.get)(SESSION_ID);

    const restarted = harness([
      mountView({ id: M1, branch: 'ak/part-one', repoSlug: null }),
      mountView({ id: M2, branch: 'ak/part-two', repoSlug: null }),
    ]);
    h.detectRepoSlug.mockResolvedValue(null);

    await refreshSessionPr(restarted.set, restarted.get)(SESSION_ID);

    expect(mountGithubOf(restarted.state, M1)?.prs.map((pr) => pr.number)).toEqual([11]);
    expect(mountGithubOf(restarted.state, M2)?.prs.map((pr) => pr.number)).toEqual([12]);
  });

  it('does not collide on the same request number in two repositories', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/topic' }),
      mountView({ id: M2, projectId: OTHER_PROJECT_ID, branch: 'ak/topic', repoSlug: 'acme/api' }),
    ]);
    h.listPrsForBranch.mockImplementation(async (_runner, repo, branch) => [
      makePr({ number: 42, repo, branch }),
    ]);

    await refreshSessionPr(set, get)(SESSION_ID);

    expect(mountGithubOf(state, M1)?.pr?.url).toBe('https://github.com/acme/web/pull/42');
    expect(mountGithubOf(state, M2)?.pr?.url).toBe('https://github.com/acme/api/pull/42');
    expect(h.links.map((link) => link.repoSlug).sort()).toEqual(['acme/api', 'acme/web']);
  });

  it('discards a branch fetch whose mount revision moved on while it was in flight', async () => {
    const { state, set, get } = harness([mountView({ id: M1, branch: 'ak/topic' })]);
    h.listPrsForBranch.mockImplementation(async (_runner, _repo, branch) => {
      state.sessionMounts = {
        [SESSION_ID]: [mountView({ id: M1, branch: 'ak/other', revision: 2 })],
      };
      return [makePr({ number: 11, branch })];
    });

    await refreshSessionPr(set, get)(SESSION_ID);

    expect(mountGithubOf(state, M1)?.pr).toBeNull();
  });

  it('keeps a provider failure on the mount that saw it', async () => {
    const { state, set, get } = harness([
      mountView({ id: M1, branch: 'ak/part-one' }),
      mountView({ id: M2, branch: 'ak/part-two' }),
    ]);
    h.listPrsForBranch.mockImplementation(async (_runner, _repo, branch) => {
      if (branch === 'ak/part-one') {
        throw new Error('authentication failed');
      }
      return [makePr({ number: 12, branch })];
    });

    await refreshSessionPr(set, get)(SESSION_ID);

    expect(mountGithubOf(state, M1)?.error).toBe('authentication failed');
    expect(mountGithubOf(state, M2)?.error).toBeNull();
    expect(mountGithubOf(state, M2)?.pr?.number).toBe(12);
  });

  it('records a discovery once per request and nothing on a repeat poll', async () => {
    const { state, set, get } = harness([mountView({ id: M1, branch: 'ak/topic' })]);
    h.listPrsForBranch.mockResolvedValue([makePr({ number: 11, branch: 'ak/topic' })]);

    await refreshSessionPr(set, get)(SESSION_ID);
    await refreshSessionPr(set, get)(SESSION_ID, { force: true });

    const record = state.recordSessionEventOnce as ReturnType<typeof vi.fn>;
    const kinds = record.mock.calls.map((call) => (call[0] as { kind: string }).kind);
    expect(kinds).toEqual(['pr_discovered']);
  });
});
