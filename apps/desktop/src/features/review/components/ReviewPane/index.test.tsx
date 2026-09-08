// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  PrComment,
  ResolvePublicationPreview,
  ResolveQueueItemWithThread,
  Session,
} from '@goodboy/types';

const h = vi.hoisted(() => {
  const state = {
    sessionGithub: {} as Record<string, unknown>,
    sessionSelectedPrNumber: {} as Record<string, number | null>,
    sessionExternalTasks: {} as Record<string, ReadonlyArray<unknown>>,
    branchPrs: [] as ReadonlyArray<unknown>,
    sessionResolveQueueItems: {} as Record<string, ReadonlyArray<unknown>>,
    sessionResolvePublications: {} as Record<string, ReadonlyArray<unknown>>,
    activePublicationPreview: {} as Record<string, unknown>,
    reviewDrafts: {} as Record<string, ReadonlyArray<unknown>>,
    diffComments: {} as Record<string, ReadonlyArray<unknown>>,
    reviewLensIntent: null as {
      sessionId: string;
      threadId?: string;
      mode?: string;
    } | null,
    setReviewLensIntent: vi.fn(),
    setResolveQueueView: vi.fn(),
    loadResolveSession: vi.fn(async () => undefined),
    refreshSessionPr: vi.fn(async () => undefined),
    refreshSessionPrDetail: vi.fn(async () => undefined),
    selectSessionPr: vi.fn(async () => undefined),
    markPrReady: vi.fn(async () => undefined),
    convertPrToDraft: vi.fn(async () => undefined),
    mergePr: vi.fn(async () => undefined),
    closePr: vi.fn(async () => undefined),
    reopenPr: vi.fn(async () => undefined),
    editPr: vi.fn(async () => undefined),
    requestReview: vi.fn(async () => undefined),
    setFocusedGithubIssueNumber: vi.fn(),
    preparePublication: vi.fn(async () => null as unknown),
    publishConversations: vi.fn(
      async (params: { readonly sessionId: string; readonly publicationId: string }) => {
        void params;
        return { kind: 'done', pushed: true, closed: 1, replied: 1, failed: 0 };
      },
    ),
    cancelPublication: vi.fn(async () => undefined),
    retryPublication: vi.fn(async () => null as unknown),
    spawnAgent: vi.fn(async () => 'agent-new'),
    setActiveLens: vi.fn(),
    publishPrReview: vi.fn(async () => ({ published: 1, stale: [], failed: [], mismatched: [] })),
    loadReviewDrafts: vi.fn(async () => undefined),
    openDiffLens: vi.fn(),
  };
  const useAppStore = Object.assign(<T,>(selector: (s: typeof state) => T) => selector(state), {
    getState: () => state,
  });
  return { state, useAppStore, showToast: vi.fn() };
});

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: h.useAppStore,
  useCurrentWorkspace: () => ({ id: 'workspace-1', name: 'goodboy' }),
  useDiffComments: (sessionId: string) => h.state.diffComments[sessionId] ?? [],
}));
vi.mock('../../../../store/slices/github/activeProjectPrs', () => ({
  selectActiveProjectPrs: () => h.state.branchPrs,
}));
vi.mock('../../../github/components/GitHubStudio/CreatePrPanel', () => ({
  CreatePrPanel: ({ onCancel }: { readonly onCancel?: () => void }) => (
    <div data-testid="create-pr">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));
vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));
vi.mock('../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    worktreePath: '/tmp/work',
    repoRoot: 'acme/web',
    branch: 'feature/retry',
  }),
}));
vi.mock('../../../../shared/hooks/useSessionRoleModels', () => ({
  useSessionRoleModels: () => ({}),
}));
vi.mock('../../../integrations/github/useGithubConnection', () => ({
  useGithubConnection: () => ({ isResolved: true, isAuthenticated: true, refresh: vi.fn() }),
}));
vi.mock('../../../github/usePrDraftAgentRunning', () => ({
  usePrDraftAgentRunning: () => false,
}));
vi.mock('../../../resolve/components/ResolveQueueHome', () => ({
  ResolveQueueHome: () => <div data-testid="resolve-queue" />,
}));
vi.mock('./WriteReview', () => ({ WriteReview: () => <div data-testid="write-review" /> }));
vi.mock('../../../../shared/lib/editor', () => ({ openUrl: vi.fn(async () => undefined) }));

import { ReviewPane } from './index';

const SESSION = { id: 'session-1', workspaceId: 'workspace-1' } as unknown as Session;
const SESSION_ID = 'session-1';

const comment = ({
  id,
  threadId,
  path,
  line,
}: {
  readonly id: string;
  readonly threadId: string;
  readonly path: string;
  readonly line: number;
}): PrComment => ({
  id,
  author: 'dhh',
  authorAvatarUrl: null,
  body: `comment on ${path}`,
  createdAt: '2026-01-01T00:00:00Z',
  url: `https://github.com/acme/web/pull/248#discussion_${id}`,
  source: 'review',
  resolved: false,
  threadId,
  path,
  line,
});

const entryOf = ({
  threadId,
  approvalState,
  deliveredAt,
}: {
  readonly threadId: string;
  readonly approvalState: 'none' | 'accepted' | 'deferred';
  readonly deliveredAt: number | null;
}): ResolveQueueItemWithThread =>
  ({
    item: {
      id: `item-${threadId}`,
      sessionId: SESSION_ID,
      threadId,
      approvalState,
      approvedRevision: approvalState === 'accepted' ? 1 : null,
      deliveredAt,
      integratedSha: null,
      deferredAt: null,
      supersededAt: null,
      candidateRevision: 1,
      generation: 0,
      reopenedFromItemId: null,
      approvedReplyHash: null,
      createdAt: 1,
      updatedAt: 1,
    },
    thread: { threadId, revision: 1, replyDraft: 'Added the early return.' },
  }) as unknown as ResolveQueueItemWithThread;

const previewOf = (patch: Partial<ResolvePublicationPreview>): ResolvePublicationPreview => ({
  publicationId: 'pub-1',
  repo: 'acme/web',
  prNumber: 248,
  branch: 'feature/retry',
  localHead: 'c3d4e5f0000',
  remoteHead: '9f8e7d60000',
  requiresPush: true,
  frozenAt: 1_700_000_000_000,
  commits: [],
  unapproved: [],
  replies: [{ threadId: 't-ready', body: 'Added the early return.', revision: 1, closes: true }],
  notes: [],
  excluded: [],
  drift: [],
  blocker: null,
  ...patch,
});

const seed = () => {
  h.state.sessionGithub = {
    [SESSION_ID]: {
      pr: {
        number: 248,
        title: 'Retry failed requests before opening the connection',
        url: 'https://github.com/acme/web/pull/248',
        state: 'open',
        mergeable: null,
        checks: null,
        baseBranch: 'main',
        headBranch: 'feature/retry',
        isDraft: true,
        reviewDecision: null,
        body: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      detail: {
        prNumber: 248,
        comments: [comment({ id: '2', threadId: 't-ready', path: 'src/retry.ts', line: 84 })],
        reviews: [],
        reviewRequests: [],
        checks: [],
      },
      detailLoading: false,
      detailError: null,
    },
  };
  h.state.sessionResolveQueueItems = {
    [SESSION_ID]: [entryOf({ threadId: 't-ready', approvalState: 'accepted', deliveredAt: null })],
  };
  h.state.activePublicationPreview = {};
  h.state.sessionResolvePublications = {};
  h.state.reviewDrafts = { [SESSION_ID]: [] };
  h.state.diffComments = { [SESSION_ID]: [] };
  h.state.reviewLensIntent = null;
  h.state.sessionSelectedPrNumber = {};
  h.state.sessionExternalTasks = {};
  h.state.branchPrs = [];
};

beforeEach(() => {
  seed();
  for (const value of Object.values(h.state)) {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as { mockClear: () => void }).mockClear();
    }
  }
});

afterEach(cleanup);

describe('ReviewPane', () => {
  it('opens on the resolve queue and renders no second surface for the same work', () => {
    render(<ReviewPane session={SESSION} />);

    expect(screen.getByTestId('resolve-queue')).toBeDefined();
    expect(screen.queryByRole('listbox', { name: 'Review conversations' })).toBeNull();
  });

  it('reaches PR details from the dock and comes back to the queue', () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'PR details' }));
    expect(screen.queryByTestId('resolve-queue')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Resolve' }));
    expect(screen.getByTestId('resolve-queue')).toBeDefined();
  });

  it('points the queue at the thread an intent carries', () => {
    h.state.reviewLensIntent = { sessionId: SESSION_ID, threadId: 't-ready' };
    render(<ReviewPane session={SESSION} />);

    expect(h.state.setResolveQueueView).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      patch: { expandedThreadId: 't-ready' },
    });
    expect(h.state.setReviewLensIntent).toHaveBeenCalledWith({ intent: null });
  });

  it('opens the mode an intent names', () => {
    h.state.reviewLensIntent = { sessionId: SESSION_ID, mode: 'checks' };
    render(<ReviewPane session={SESSION} />);

    expect(screen.getByRole('button', { name: 'Checks' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('counts what is accepted but not delivered on the one push button', () => {
    render(<ReviewPane session={SESSION} />);

    expect(screen.getByRole('button', { name: 'Reply 1' })).toBeDefined();
  });

  it('costs one press and one confirmation in the same strip', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    const { rerender } = render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reply 1' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reply 1' }));

    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));
    expect(h.state.publishConversations.mock.calls[0]?.[0]).toMatchObject({
      publicationId: 'pub-1',
    });
  });

  it('drafts a pull request inline when the session has none', () => {
    h.state.sessionGithub = {
      [SESSION_ID]: { pr: null, detail: null, detailLoading: false, detailError: null },
    };
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Draft a pull request' }));

    expect(screen.getByTestId('create-pr')).toBeDefined();
  });

  it('submits the review from Write review and returns to the queue', async () => {
    h.state.reviewDrafts = {
      [SESSION_ID]: [{ id: 'draft-1', status: 'draft' } as unknown as never],
    };
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Write review (1)' }));
    expect(screen.getByTestId('write-review')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Submit review (1)' }));
    await waitFor(() => expect(h.state.publishPrReview).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Back to Resolve' }));
    expect(screen.getByTestId('resolve-queue')).toBeDefined();
  });

  it('never opens a dialog on any primary path', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    const { rerender } = render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reply 1' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalled());
    rerender(<ReviewPane session={SESSION} />);
    fireEvent.click(screen.getByRole('button', { name: 'PR activity' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
