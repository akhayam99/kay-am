import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  OverrideSettings,
  ProjectId,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { AppStore } from '../../store';
import { overridesWithAttribution } from '../../../__tests__/helpers/attributionOverrides';
import type { BitbucketPullRequest } from '../../../features/integrations/bitbucket/client';

const pullRequestForBranchSpy = vi.fn();
const getPullRequestSpy = vi.fn();
const remoteUrlSpy = vi.fn(async () => 'git@bitbucket.org:acme/rocket.git');
const writeSpies = {
  approve: vi.fn(),
  unapprove: vi.fn(),
  requestChanges: vi.fn(),
  unrequestChanges: vi.fn(),
  merge: vi.fn(),
  decline: vi.fn(),
  comment: vi.fn(),
  reply: vi.fn(),
};

vi.mock('../../../features/integrations/bitbucket/client', () => ({
  bitbucketPullRequestForBranch: (...args: ReadonlyArray<unknown>) =>
    pullRequestForBranchSpy(...args),
  bitbucketGetPullRequest: (...args: ReadonlyArray<unknown>) => getPullRequestSpy(...args),
  bitbucketApprovePullRequest: (...args: ReadonlyArray<unknown>) => writeSpies.approve(...args),
  bitbucketUnapprovePullRequest: (...args: ReadonlyArray<unknown>) => writeSpies.unapprove(...args),
  bitbucketRequestChanges: (...args: ReadonlyArray<unknown>) => writeSpies.requestChanges(...args),
  bitbucketUnrequestChanges: (...args: ReadonlyArray<unknown>) =>
    writeSpies.unrequestChanges(...args),
  bitbucketMergePullRequest: (...args: ReadonlyArray<unknown>) => writeSpies.merge(...args),
  bitbucketDeclinePullRequest: (...args: ReadonlyArray<unknown>) => writeSpies.decline(...args),
  bitbucketCreatePullRequestComment: (...args: ReadonlyArray<unknown>) =>
    writeSpies.comment(...args),
  bitbucketReplyToPullRequestComment: (...args: ReadonlyArray<unknown>) =>
    writeSpies.reply(...args),
}));

vi.mock('../../../features/worktree/worktree', () => ({
  worktreeRemoteUrl: () => remoteUrlSpy(),
}));

const links: Array<MountPullRequestLink> = [];

vi.mock('@goodboy/db', () => ({
  listMountPullRequestLinks: vi.fn(async ({ mountId }: { readonly mountId: MountId }) =>
    links.filter((link) => link.mountId === mountId),
  ),
  upsertMountPullRequestLink: vi.fn(async ({ link }: { readonly link: MountPullRequestLink }) => {
    const index = links.findIndex(
      (candidate) =>
        candidate.mountId === link.mountId &&
        candidate.host === link.host &&
        candidate.repoSlug === link.repoSlug &&
        candidate.prNumber === link.prNumber,
    );
    if (index >= 0) {
      links.splice(index, 1, link);
    } else {
      links.push(link);
    }
    return true;
  }),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

const { createBitbucketPrSlice, initialBitbucketPrState } = await import('./index');

const SESSION_ID = 'sess-1' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const M1 = 'mount-1' as MountId;
const M2 = 'mount-2' as MountId;

type MountParams = {
  readonly id: MountId;
  readonly branch: string;
  readonly revision?: number;
};

const mountView = ({ id, branch, revision = 1 }: MountParams): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  mountName: 'rocket',
  worktreePath: `/repos/rocket/${id}`,
  lastWorktreePath: null,
  repoRoot: '/repos/rocket',
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

const buildPr = (id: number): BitbucketPullRequest => ({
  id,
  title: `pull request ${id}`,
  description: '',
  state: 'OPEN',
  createdOn: '2026-08-01T10:00:00Z',
  updatedOn: '2026-08-01T11:00:00Z',
  sourceBranch: 'ak/feat-thing',
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
  webUrl: null,
});

type TestState = Record<string, unknown>;

type BuildStoreParams = {
  readonly workspaceOverrides?: Record<string, OverrideSettings>;
  readonly mounts?: ReadonlyArray<unknown>;
  readonly activeMountId?: MountId;
};

const buildStore = ({
  workspaceOverrides = {},
  mounts = [mountView({ id: M1, branch: 'ak/feat-thing' })],
  activeMountId = M1,
}: BuildStoreParams = {}) => {
  let state: TestState = {
    ...initialBitbucketPrState,
    workspaceOverrides,
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, goal: 'ship it' }],
    sessionProjectMounts: {},
    sessionMounts: { [SESSION_ID]: mounts },
    sessionActiveMount: { [SESSION_ID]: activeMountId },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    recordSessionEventOnce: vi.fn(async () => undefined),
    workspaceIntegrations: {
      [WORKSPACE_ID]: [
        {
          provider: 'bitbucket',
          config: { workspaceSlug: 'acme', email: 'dev@acme.test' },
        },
      ],
    },
  };
  const set = (partial: unknown) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...(next as TestState) };
  };
  const get = () => state as unknown as AppStore;
  const slice = createBitbucketPrSlice(
    set as Parameters<typeof createBitbucketPrSlice>[0],
    get as Parameters<typeof createBitbucketPrSlice>[1],
  );
  Object.assign(state, slice);
  return { getState: () => state, slice };
};

describe('bitbucket-pr slice', () => {
  beforeEach(() => {
    pullRequestForBranchSpy.mockReset();
    getPullRequestSpy.mockReset();
    remoteUrlSpy.mockClear();
    links.length = 0;
  });

  it('resolves the session branch to its pull request and records the repo', async () => {
    pullRequestForBranchSpy.mockResolvedValue(buildPr(7));
    const store = buildStore();

    await store.slice.refreshSessionBitbucketPr(SESSION_ID);

    expect(pullRequestForBranchSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      workspaceSlug: 'acme',
      repoSlug: 'rocket',
      email: 'dev@acme.test',
      sourceBranch: 'ak/feat-thing',
    });
    const state = store.getState();
    expect(
      (state.sessionBitbucketPr as Record<string, { pr: BitbucketPullRequest | null }>)[SESSION_ID]
        ?.pr?.id,
    ).toBe(7);
    expect(
      (state.sessionBitbucketRepo as Record<string, { repoSlug: string }>)[SESSION_ID]?.repoSlug,
    ).toBe('rocket');
  });

  it('records the failure instead of clearing the pull request already on screen', async () => {
    pullRequestForBranchSpy.mockResolvedValueOnce(buildPr(7));
    const store = buildStore();
    await store.slice.refreshSessionBitbucketPr(SESSION_ID);

    pullRequestForBranchSpy.mockRejectedValueOnce(new Error('bitbucket is down'));
    await store.slice.refreshSessionBitbucketPr(SESSION_ID, { force: true });

    const entry = (
      store.getState().sessionBitbucketPr as Record<
        string,
        { pr: BitbucketPullRequest | null; error: string | null; loading: boolean }
      >
    )[SESSION_ID];
    expect(entry?.error).toContain('bitbucket is down');
    expect(entry?.pr?.id).toBe(7);
    expect(entry?.loading).toBe(false);
  });

  it('selecting a pull request fetches that one by id instead of the branch one', async () => {
    getPullRequestSpy.mockResolvedValue(buildPr(12));
    const store = buildStore();

    await store.slice.selectSessionBitbucketPr(SESSION_ID, 12);

    expect(pullRequestForBranchSpy).not.toHaveBeenCalled();
    expect(getPullRequestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pullRequestId: 12, repoSlug: 'rocket' }),
    );
    expect(
      (store.getState().sessionBitbucketPr as Record<string, { pr: BitbucketPullRequest | null }>)[
        SESSION_ID
      ]?.pr?.id,
    ).toBe(12);
  });

  it('does nothing when the workspace has no bitbucket integration', async () => {
    const store = buildStore();
    Object.assign(store.getState(), { workspaceIntegrations: {} });

    await store.slice.refreshSessionBitbucketPr(SESSION_ID);

    expect(pullRequestForBranchSpy).not.toHaveBeenCalled();
    expect(store.getState().sessionBitbucketPr).toEqual({});
  });
});

const REPO = {
  workspaceId: WORKSPACE_ID,
  workspaceSlug: 'acme',
  repoSlug: 'rocket',
  email: 'dev@acme.test',
};

const TARGET = { sessionId: SESSION_ID, repo: REPO, pullRequestId: 12 };

describe('bitbucket-pr write verbs', () => {
  beforeEach(() => {
    getPullRequestSpy.mockReset();
    getPullRequestSpy.mockResolvedValue(buildPr(12));
    pullRequestForBranchSpy.mockReset();
    Object.values(writeSpies).forEach((spy) => spy.mockReset());
    links.length = 0;
  });

  it.each([
    ['approveBitbucketPr', 'approve'],
    ['unapproveBitbucketPr', 'unapprove'],
    ['requestBitbucketPrChanges', 'requestChanges'],
    ['withdrawBitbucketPrChanges', 'unrequestChanges'],
    ['mergeBitbucketPr', 'merge'],
    ['declineBitbucketPr', 'decline'],
  ] as const)('%s calls the %s client function for that pull request', async (action, spyKey) => {
    const store = buildStore();

    await store.slice[action](TARGET);

    expect(writeSpies[spyKey]).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      workspaceSlug: 'acme',
      repoSlug: 'rocket',
      email: 'dev@acme.test',
      pullRequestId: 12,
    });
    const others = Object.entries(writeSpies).filter(([key]) => key !== spyKey);
    others.forEach(([, spy]) => expect(spy).not.toHaveBeenCalled());
  });

  it('re-reads the pull request it just wrote to, by id, instead of the branch one', async () => {
    const store = buildStore();

    await store.slice.approveBitbucketPr(TARGET);

    expect(getPullRequestSpy).toHaveBeenCalledWith(expect.objectContaining({ pullRequestId: 12 }));
    expect(pullRequestForBranchSpy).not.toHaveBeenCalled();
    expect(
      (store.getState().sessionBitbucketPr as Record<string, { pr: BitbucketPullRequest | null }>)[
        SESSION_ID
      ]?.pr?.id,
    ).toBe(12);
  });

  it('a reply carries the parent comment id and a top level comment does not', async () => {
    const store = buildStore();

    await store.slice.commentOnBitbucketPr({ ...TARGET, body: 'looks good' });
    await store.slice.replyToBitbucketPrComment({
      ...TARGET,
      body: 'agreed',
      parentCommentId: 5,
    });

    expect(writeSpies.comment).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestId: 12,
        body: `looks good\n\n*Written by Goodboy*`,
      }),
    );
    expect(writeSpies.comment.mock.calls[0]?.[0]).not.toHaveProperty('parentCommentId');
    expect(writeSpies.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestId: 12,
        parentCommentId: 5,
        body: `agreed\n\n*Written by Goodboy*`,
      }),
    );
  });

  it('drops the attribution line when the workspace switched it off', async () => {
    const store = buildStore({
      workspaceOverrides: {
        [WORKSPACE_ID]: overridesWithAttribution({ attributionFooter: false }),
      },
    });

    await store.slice.commentOnBitbucketPr({ ...TARGET, body: 'looks good' });

    expect(writeSpies.comment).toHaveBeenLastCalledWith(
      expect.objectContaining({ pullRequestId: 12, body: 'looks good' }),
    );
  });

  it('a failed write raises to the caller and skips the refresh', async () => {
    writeSpies.merge.mockRejectedValueOnce(new Error('bitbucket said no'));
    const store = buildStore();

    await expect(store.slice.mergeBitbucketPr(TARGET)).rejects.toThrow('bitbucket said no');

    expect(getPullRequestSpy).not.toHaveBeenCalled();
  });
});
