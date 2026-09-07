import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentId,
  IntegrationCredentialId,
  IsoDateTime,
  PrReviewDraft,
  SessionExternalTask,
  SessionId,
  WorkspaceId,
  IntegrationBindingId,
} from '@goodboy/types';
import type { AppStore } from '../../store';
import type { SetFn } from './types';
import { overridesWithAttribution } from '../../../__tests__/helpers/attributionOverrides';
import { createReviewDraftsSlice } from './index';

const {
  insertSpy,
  listSpy,
  updateBodySpy,
  deleteSpy,
  markPublishedSpy,
  ghPrDiffSpy,
  fetchPrNodeIdSpy,
  addPullRequestReviewSpy,
  gitlabMrDiffSpy,
  gitlabMrDiffRefsSpy,
  gitlabCreateMrDiscussionSpy,
  gitlabCreateMrNoteSpy,
} = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  listSpy: vi.fn(),
  updateBodySpy: vi.fn(),
  deleteSpy: vi.fn(),
  markPublishedSpy: vi.fn(),
  ghPrDiffSpy: vi.fn(),
  fetchPrNodeIdSpy: vi.fn(),
  addPullRequestReviewSpy: vi.fn(),
  gitlabMrDiffSpy: vi.fn(),
  gitlabMrDiffRefsSpy: vi.fn(),
  gitlabCreateMrDiscussionSpy: vi.fn(),
  gitlabCreateMrNoteSpy: vi.fn(),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('@goodboy/db', () => ({
  insertPrReviewDraft: insertSpy,
  listPrReviewDraftsForSession: listSpy,
  updatePrReviewDraftBody: updateBodySpy,
  deletePrReviewDraft: deleteSpy,
  markPrReviewDraftsPublished: markPublishedSpy,
}));

vi.mock('@goodboy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@goodboy/core')>()),
  fetchPrNodeId: fetchPrNodeIdSpy,
  addPullRequestReview: addPullRequestReviewSpy,
}));

vi.mock('../../../features/github/github', () => ({
  ghPrDiff: ghPrDiffSpy,
  tauriGhRunner: { run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })) },
}));

vi.mock('../../../features/integrations/gitlab/client', () => ({
  gitlabMrDiff: gitlabMrDiffSpy,
  gitlabMrDiffRefs: gitlabMrDiffRefsSpy,
  gitlabCreateMrDiscussion: gitlabCreateMrDiscussionSpy,
  gitlabCreateMrNote: gitlabCreateMrNoteSpy,
}));

const WS_ID = 'workspace-1' as WorkspaceId;
const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const NOW = '2026-07-23T00:00:00.000Z' as IsoDateTime;

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' line one',
  '+added line',
  ' line three',
  ' line four',
  '',
].join('\n');

const githubTask: SessionExternalTask = {
  sessionId: SESSION_ID,
  provider: 'github',
  externalId: '42',
  identifier: '#42',
  url: 'https://github.com/acme/web/pull/42',
  title: 'PR',
  createdAt: NOW,
};

const gitlabTask: SessionExternalTask = {
  sessionId: SESSION_ID,
  provider: 'gitlab',
  externalId: '10',
  identifier: '!10',
  url: 'https://gitlab.com/acme/web/-/merge_requests/10',
  title: 'MR',
  createdAt: NOW,
};

type MakeDraftParams = {
  readonly overrides?: Partial<PrReviewDraft>;
};

const makeDraft = ({ overrides = {} }: MakeDraftParams): PrReviewDraft => ({
  id: 'draft-1',
  sessionId: SESSION_ID,
  provider: 'github',
  repo: 'acme/web',
  prNumber: 42,
  path: 'src/a.ts',
  line: 2,
  startLine: null,
  side: 'new',
  body: 'guard the null case',
  status: 'draft',
  stale: false,
  origin: 'agent',
  createdAt: NOW,
  ...overrides,
});

type Harness = {
  slice: ReturnType<typeof createReviewDraftsSlice>;
  getState: () => AppStore;
};

const buildHarness = (initial: Record<string, unknown>): Harness => {
  let state = {
    reviewDrafts: {},
    sessions: [{ id: SESSION_ID, workspaceId: WS_ID, activeProjectId: 'project-1' }],
    workspaces: [{ id: WS_ID, name: 'ws' }],
    projects: [
      {
        id: 'project-1',
        workspaceId: WS_ID,
        name: 'repo',
        rootPath: '/tmp/repo',
        kind: 'repo',
      },
    ],
    workspaceIntegrations: {},
    workspaceOverrides: {},
    sessionExternalTasks: { [SESSION_ID]: [githubTask] },
    sessionProjectPrs: {},
    sessionGithub: {},
    sessionGitlabMr: {},
    sessionWorktrees: { [SESSION_ID]: ['/tmp/repo/.goodboy/worktrees/review'] },
    sessionBranches: { [SESSION_ID]: 'review' },
    sessionProjectMounts: {
      [SESSION_ID]: [
        {
          projectId: 'project-1',
          mountName: 'repo',
          repoRoot: '/tmp/repo',
          worktreePath: '/tmp/repo/.goodboy/worktrees/review',
          branch: 'review',
        },
      ],
    },
    sessionActiveProject: { [SESSION_ID]: 'project-1' },
    emitNotification: vi.fn(),
    ...initial,
  } as unknown as AppStore;
  const get = () => state;
  const set: SetFn = (p) => {
    const patch = typeof p === 'function' ? p(state) : p;
    state = { ...state, ...patch };
  };
  return { slice: createReviewDraftsSlice(set, get), getState: get };
};

describe('review-drafts slice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockResolvedValue(undefined);
    updateBodySpy.mockResolvedValue(undefined);
    deleteSpy.mockResolvedValue(undefined);
    markPublishedSpy.mockResolvedValue(undefined);
    ghPrDiffSpy.mockResolvedValue(DIFF);
    gitlabMrDiffSpy.mockResolvedValue(DIFF);
    fetchPrNodeIdSpy.mockResolvedValue('PR_node1');
    addPullRequestReviewSpy.mockResolvedValue({ id: 'PRR_1', url: 'u' });
    gitlabMrDiffRefsSpy.mockResolvedValue({ baseSha: 'aaa', headSha: 'bbb', startSha: 'ccc' });
    gitlabCreateMrDiscussionSpy.mockResolvedValue('disc-1');
    gitlabCreateMrNoteSpy.mockResolvedValue(7);
  });

  it('queues agent markers as persisted drafts resolved from the linked PR', async () => {
    const { slice, getState } = buildHarness({});
    await slice.queueAgentReviewComments(SESSION_ID, AGENT_ID, [
      { path: 'src/a.ts', line: 2, startLine: null, side: 'new', body: 'guard the null case' },
      { path: 'src/b.ts', line: 9, startLine: 5, side: 'new', body: 'extract this' },
    ]);
    expect(insertSpy).toHaveBeenCalledTimes(2);
    const drafts = getState().reviewDrafts[SESSION_ID] ?? [];
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.origin).toBe('agent');
    expect(drafts[0]?.provider).toBe('github');
    expect(drafts[0]?.repo).toBe('acme/web');
    expect(drafts[0]?.prNumber).toBe(42);
    expect(drafts[1]?.startLine).toBe(5);
  });

  it('adds, updates, and discards a user draft', async () => {
    const { slice, getState } = buildHarness({});
    const draft = await slice.addReviewDraft({
      sessionId: SESSION_ID,
      path: 'src/a.ts',
      line: 2,
      body: 'first version',
    });
    expect(draft.origin).toBe('user');
    expect(getState().reviewDrafts[SESSION_ID]).toHaveLength(1);

    await slice.updateReviewDraft(draft.id, 'second version');
    expect(updateBodySpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: draft.id, body: 'second version' }),
    );
    expect(getState().reviewDrafts[SESSION_ID]?.[0]?.body).toBe('second version');

    await slice.discardReviewDraft(draft.id);
    expect(deleteSpy).toHaveBeenCalledWith(expect.objectContaining({ id: draft.id }));
    expect(getState().reviewDrafts[SESSION_ID]).toEqual([]);
  });

  it('publishes fresh github drafts as one batched review and marks them published', async () => {
    const drafts = [makeDraft({}), makeDraft({ overrides: { id: 'draft-2', line: 3 } })];
    const { slice, getState } = buildHarness({ reviewDrafts: { [SESSION_ID]: drafts } });

    const result = await slice.publishPrReview(SESSION_ID, { verdict: 'approve', body: 'lgtm' });

    expect(addPullRequestReviewSpy).toHaveBeenCalledTimes(1);
    const [, input] = addPullRequestReviewSpy.mock.calls[0]!;
    expect(input.pullRequestId).toBe('PR_node1');
    expect(input.event).toBe('APPROVE');
    expect(input.body).toBe(`lgtm\n\n*Written by Goodboy*`);
    expect(input.threads).toHaveLength(2);
    expect(input.threads[0]).toEqual(
      expect.objectContaining({ path: 'src/a.ts', line: 2, side: 'RIGHT' }),
    );
    for (const thread of input.threads) {
      expect(thread.body).not.toContain('Written by Goodboy');
    }
    expect(markPublishedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['draft-1', 'draft-2'] }),
    );
    expect(result).toEqual({ published: 2, stale: [], failed: [], mismatched: [] });
    expect(getState().reviewDrafts[SESSION_ID]?.map((draft) => draft.status)).toEqual([
      'published',
      'published',
    ]);
  });

  it('signs only the review summary, never a per line comment', async () => {
    const drafts = [makeDraft({}), makeDraft({ overrides: { id: 'draft-2', line: 3 } })];
    const { slice } = buildHarness({
      reviewDrafts: { [SESSION_ID]: drafts },
      workspaceOverrides: { [WS_ID]: overridesWithAttribution({ attributionFooter: true }) },
    });

    await slice.publishPrReview(SESSION_ID, { verdict: 'comment', body: 'a few notes' });

    const [, input] = addPullRequestReviewSpy.mock.calls[0]!;
    expect(input.body).toBe(`a few notes\n\n*Written by Goodboy*`);
    expect(input.threads.map((thread: { body: string }) => thread.body)).toEqual([
      'guard the null case',
      'guard the null case',
    ]);
  });

  it('leaves the summary unsigned when the workspace switched attribution off', async () => {
    const drafts = [makeDraft({})];
    const { slice } = buildHarness({
      reviewDrafts: { [SESSION_ID]: drafts },
      workspaceOverrides: { [WS_ID]: overridesWithAttribution({ attributionFooter: false }) },
    });

    await slice.publishPrReview(SESSION_ID, { verdict: 'approve', body: 'lgtm' });

    expect(addPullRequestReviewSpy.mock.calls[0]?.[1].body).toBe('lgtm');
  });

  it('publishes against the explicit target instead of the first linked task', async () => {
    const secondTask: SessionExternalTask = {
      ...githubTask,
      externalId: '77',
      identifier: '#77',
      url: 'https://github.com/acme/api/pull/77',
    };
    const { slice } = buildHarness({
      sessionExternalTasks: { [SESSION_ID]: [githubTask, secondTask] },
    });

    await slice.publishPrReview(SESSION_ID, {
      verdict: 'approve',
      body: '',
      target: { provider: 'github', repo: 'acme/api', prNumber: 77 },
    });

    expect(ghPrDiffSpy.mock.calls[0]?.slice(0, 2)).toEqual(['acme/api', 77]);
    expect(fetchPrNodeIdSpy.mock.calls[0]?.slice(1, 3)).toEqual(['acme/api', 77]);
    expect(addPullRequestReviewSpy.mock.calls[0]?.[1].event).toBe('APPROVE');
  });

  it('excludes stale drafts from the published review and flags them in state', async () => {
    const drafts = [makeDraft({}), makeDraft({ overrides: { id: 'draft-stale', line: 99 } })];
    const { slice, getState } = buildHarness({ reviewDrafts: { [SESSION_ID]: drafts } });

    const result = await slice.publishPrReview(SESSION_ID, { verdict: 'comment', body: '' });

    const [, input] = addPullRequestReviewSpy.mock.calls[0]!;
    expect(input.threads).toHaveLength(1);
    expect(result.published).toBe(1);
    expect(result.stale.map((draft) => draft.id)).toEqual(['draft-stale']);
    const staleDraft = getState().reviewDrafts[SESSION_ID]?.find(
      (draft) => draft.id === 'draft-stale',
    );
    expect(staleDraft?.status).toBe('draft');
    expect(staleDraft?.stale).toBe(true);
  });

  it('keeps unpublished drafts on gitlab partial failure and prefixes the summary note', async () => {
    gitlabCreateMrDiscussionSpy
      .mockResolvedValueOnce('disc-1')
      .mockRejectedValueOnce(new Error('position invalid'));
    const drafts = [
      makeDraft({ overrides: { provider: 'gitlab', prNumber: 10 } }),
      makeDraft({ overrides: { id: 'draft-2', line: 3, provider: 'gitlab', prNumber: 10 } }),
    ];
    const { slice, getState } = buildHarness({
      reviewDrafts: { [SESSION_ID]: drafts },
      sessionExternalTasks: { [SESSION_ID]: [gitlabTask] },
      workspaceIntegrations: {
        [WS_ID]: [
          {
            id: 'wi-1' as IntegrationBindingId,
            workspaceId: WS_ID,
            provider: 'gitlab',
            credentialId: 'k' as IntegrationCredentialId,
            config: { userName: 'nbro', userId: '1', host: 'https://gitlab.com' },
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    });

    const result = await slice.publishPrReview(SESSION_ID, {
      verdict: 'request_changes',
      body: 'overall notes',
    });

    expect(gitlabCreateMrDiscussionSpy).toHaveBeenCalledTimes(2);
    expect(gitlabCreateMrNoteSpy).toHaveBeenCalledWith(
      WS_ID,
      'https://gitlab.com',
      'acme/web',
      10,
      `Request changes: overall notes\n\n*Written by Goodboy*`,
    );
    expect(result.published).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.draft.id).toBe('draft-2');
    expect(result.failed[0]?.error).toContain('position invalid');
    expect(markPublishedSpy).toHaveBeenCalledWith(expect.objectContaining({ ids: ['draft-1'] }));
    expect(getState().reviewDrafts[SESSION_ID]?.map((draft) => draft.status)).toEqual([
      'published',
      'draft',
    ]);
  });

  it('leaves drafts untouched when the session relinks to a different pr (review board entry)', async () => {
    const otherTask: SessionExternalTask = {
      ...githubTask,
      externalId: '77',
      identifier: '#77',
      url: 'https://github.com/acme/api/pull/77',
    };
    const drafts = [makeDraft({}), makeDraft({ overrides: { id: 'draft-2', line: 3 } })];
    const { slice, getState } = buildHarness({
      reviewDrafts: { [SESSION_ID]: drafts },
      sessionExternalTasks: { [SESSION_ID]: [otherTask] },
    });

    const result = await slice.publishPrReview(SESSION_ID, { verdict: 'approve', body: 'lgtm' });

    expect(ghPrDiffSpy.mock.calls[0]?.slice(0, 2)).toEqual(['acme/api', 77]);
    expect(addPullRequestReviewSpy.mock.calls[0]?.[1].threads).toEqual([]);
    expect(result.published).toBe(0);
    expect(result.mismatched.map((draft) => draft.id)).toEqual(['draft-1', 'draft-2']);
    expect(getState().reviewDrafts[SESSION_ID]?.map((draft) => draft.status)).toEqual([
      'draft',
      'draft',
    ]);
  });

  it('leaves drafts untouched when the caller publishes against an explicit target that does not match (pr detail panel entry)', async () => {
    const drafts = [makeDraft({}), makeDraft({ overrides: { id: 'draft-2', line: 3 } })];
    const { slice, getState } = buildHarness({
      reviewDrafts: { [SESSION_ID]: drafts },
    });

    const result = await slice.publishPrReview(SESSION_ID, {
      verdict: 'approve',
      body: 'lgtm',
      target: { provider: 'github', repo: 'acme/other', prNumber: 99 },
    });

    expect(ghPrDiffSpy.mock.calls[0]?.slice(0, 2)).toEqual(['acme/other', 99]);
    expect(addPullRequestReviewSpy.mock.calls[0]?.[1].threads).toEqual([]);
    expect(result.published).toBe(0);
    expect(result.mismatched.map((draft) => draft.id)).toEqual(['draft-1', 'draft-2']);
    expect(getState().reviewDrafts[SESSION_ID]?.map((draft) => draft.status)).toEqual([
      'draft',
      'draft',
    ]);
  });

  it('loads persisted drafts into state', async () => {
    listSpy.mockResolvedValue([makeDraft({})]);
    const { slice, getState } = buildHarness({});
    await slice.loadReviewDrafts(SESSION_ID);
    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId: SESSION_ID }));
    expect(getState().reviewDrafts[SESSION_ID]).toHaveLength(1);
  });
});
