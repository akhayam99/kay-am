import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  IsoDateTime,
  PullRequestState,
  Session,
  SessionExternalTask,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { GitlabMergeRequest } from '../../../../integrations/gitlab/client';
import {
  resolveReviewTarget,
  type ReviewTargetState,
} from '../../../../../store/slices/review-drafts/resolveReviewTarget';

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const NOW = '2026-08-01T00:00:00.000Z' as IsoDateTime;

const h = vi.hoisted(() => ({
  ghPrDiff: vi.fn(async () => ''),
  gitlabMrDiff: vi.fn(async () => ''),
}));

vi.mock('@goodboy/core', () => ({ parseUnifiedDiff: () => [] }));
vi.mock('../../../../github/github', () => ({ ghPrDiff: h.ghPrDiff }));
vi.mock('../../../../integrations/gitlab/client', () => ({ gitlabMrDiff: h.gitlabMrDiff }));
vi.mock('../../../../../store/slices/worktrees/resolveSessionRepo', () => ({
  resolveSessionRepo: () => ({
    repoRoot: '/repo',
    worktreePath: '/repo',
    branch: 'ak/feature',
    mountName: null,
    workspaceId: WORKSPACE_ID,
  }),
}));

type MockStore = ReviewTargetState & {
  readonly workspaces: ReadonlyArray<{ readonly id: WorkspaceId; readonly rootPath: string }>;
  readonly workspaceIntegrations: Readonly<
    Record<string, ReadonlyArray<{ readonly provider: string; readonly config: { host: string } }>>
  >;
};

vi.mock('../../../../../store', () => ({
  useAppStore: <T>(selector: (store: MockStore) => T) => selector(state),
}));

const session: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'Review the merge request',
  state: { kind: 'idle', lastActivityAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
  permissionMode: 'bypassPermissions',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
};

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

const mergeRequest: GitlabMergeRequest = {
  id: 100,
  iid: 10,
  projectId: 3,
  title: 'MR',
  description: null,
  state: 'opened',
  webUrl: 'https://gitlab.com/acme/web/-/merge_requests/10',
  sourceBranch: 'ak/feature',
  targetBranch: 'main',
  draft: false,
  hasConflicts: false,
  mergeStatus: 'can_be_merged',
  updatedAt: NOW,
};

const pullRequest: PullRequestState = {
  number: 1631,
  title: 'PR',
  url: 'https://github.com/acme/web/pull/1631',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/feature',
  isDraft: false,
  reviewDecision: null,
  body: '',
  updatedAt: NOW,
};

const githubState = (pr: PullRequestState | null): MockStore['sessionGithub'] => ({
  [SESSION_ID]: {
    pr,
    linkedIssues: [],
    fetchedAt: NOW,
    failedAt: null,
    loading: false,
    error: null,
    detail: null,
    detailFetchedAt: null,
    detailLoading: false,
    detailError: null,
  },
});

const BASE_STATE: MockStore = {
  sessionExternalTasks: { [SESSION_ID]: [githubTask, gitlabTask] },
  sessions: [],
  projects: [],
  sessionMounts: {},
  sessionActiveMount: {},
  sessionProjectMounts: {},
  sessionActiveProject: {},
  sessionProjectPrs: { [SESSION_ID]: {} },
  sessionGithub: githubState(null),
  sessionGitlabMr: {
    [SESSION_ID]: { mr: mergeRequest, fetchedAt: NOW, loading: false, error: null },
  },
  workspaces: [{ id: WORKSPACE_ID, rootPath: '/repo' }],
  workspaceIntegrations: {
    [WORKSPACE_ID]: [{ provider: 'gitlab', config: { host: 'https://gitlab.com' } }],
  },
};

let state: MockStore = BASE_STATE;

import { useReviewDiff } from './useReviewDiff';

afterEach(() => {
  cleanup();
  state = BASE_STATE;
  h.ghPrDiff.mockClear();
  h.gitlabMrDiff.mockClear();
});

describe('useReviewDiff', () => {
  it('resolves the same target the review draft path stamps on every comment', async () => {
    const { result } = renderHook(() => useReviewDiff({ session }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.target).toEqual({
      provider: 'gitlab',
      repo: 'acme/web',
      prNumber: 10,
    });
    expect(result.current.target).toEqual(resolveReviewTarget({ state, sessionId: SESSION_ID }));
  });

  it('fetches the diff of the merge request this session opened, not a linked candidate', async () => {
    renderHook(() => useReviewDiff({ session }));

    await waitFor(() => expect(h.gitlabMrDiff).toHaveBeenCalledOnce());

    expect(h.gitlabMrDiff).toHaveBeenCalledWith(WORKSPACE_ID, 'https://gitlab.com', 'acme/web', 10);
    expect(h.ghPrDiff).not.toHaveBeenCalled();
  });

  it('fetches the diff of the pull request this session opened with nothing linked', async () => {
    state = {
      ...BASE_STATE,
      sessionExternalTasks: { [SESSION_ID]: [] },
      sessionGithub: githubState(pullRequest),
      sessionGitlabMr: { [SESSION_ID]: { mr: null, fetchedAt: NOW, loading: false, error: null } },
    };

    const { result } = renderHook(() => useReviewDiff({ session }));

    await waitFor(() => expect(h.ghPrDiff).toHaveBeenCalledOnce());

    expect(result.current.target).toEqual({
      provider: 'github',
      repo: 'acme/web',
      prNumber: 1631,
    });
    expect(h.ghPrDiff).toHaveBeenCalledWith('acme/web', 1631, '/repo', WORKSPACE_ID, undefined);
    expect(h.gitlabMrDiff).not.toHaveBeenCalled();
  });

  it('reports no target and no error once the links loaded without a pull request', async () => {
    state = {
      ...BASE_STATE,
      sessionExternalTasks: { [SESSION_ID]: [] },
      sessionGitlabMr: { [SESSION_ID]: { mr: null, fetchedAt: NOW, loading: false, error: null } },
    };

    const { result } = renderHook(() => useReviewDiff({ session }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.files).toEqual([]);
    expect(h.ghPrDiff).not.toHaveBeenCalled();
    expect(h.gitlabMrDiff).not.toHaveBeenCalled();
  });

  it('stays loading while the session links are not loaded yet', () => {
    state = {
      ...BASE_STATE,
      sessionExternalTasks: {},
      sessionGitlabMr: { [SESSION_ID]: { mr: null, fetchedAt: NOW, loading: false, error: null } },
    };

    const { result } = renderHook(() => useReviewDiff({ session }));

    expect(result.current.loading).toBe(true);
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
