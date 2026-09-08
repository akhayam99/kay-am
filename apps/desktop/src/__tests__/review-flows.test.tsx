// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AgentId,
  OpenQuestion,
  PrComment,
  ResolveAttempt,
  ResolvePublicationPreview,
  ResolveThread,
  Session,
} from '@goodboy/types';

const h = vi.hoisted(() => {
  const state = {
    sessionGithub: {} as Record<string, unknown>,
    sessionSelectedPrNumber: {} as Record<string, number | null>,
    sessionExternalTasks: {} as Record<string, ReadonlyArray<unknown>>,
    branchPrs: [] as ReadonlyArray<unknown>,
    sessionResolveThreads: {} as Record<string, ReadonlyArray<unknown>>,
    sessionResolveAttempts: {} as Record<string, ReadonlyArray<unknown>>,
    activePublicationPreview: {} as Record<string, unknown>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    sessionOpenQuestions: {} as Record<string, ReadonlyArray<unknown>>,
    reviewDrafts: {} as Record<string, ReadonlyArray<unknown>>,
    diffComments: {} as Record<string, ReadonlyArray<unknown>>,
    reviewLensIntent: null as { sessionId: string; threadId?: string; mode?: string } | null,
    setReviewLensIntent: vi.fn(),
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
    publishConversations: vi.fn(async () => ({
      kind: 'done',
      pushed: true,
      resolved: 1,
      commented: 1,
      failed: 0,
    })),
    retryPublication: vi.fn(async () => null as unknown),
    cancelPublication: vi.fn(async () => undefined),
    cancelResolveAttempt: vi.fn(async () => undefined),
    forceCloseResolver: vi.fn(async () => undefined),
    answerOpenQuestions: vi.fn(
      async (
        sessionId: string,
        pairs: ReadonlyArray<{
          readonly id: string;
          readonly text: string;
          readonly answer: string;
        }>,
        agentId: string | null,
      ) => {
        void sessionId;
        void pairs;
        void agentId;
      },
    ),
    updateResolveThread: vi.fn(async () => true),
    spawnAgent: vi.fn(
      async (
        sessionId: string,
        args: {
          readonly sourceThreadIds?: ReadonlyArray<string>;
          readonly kindOverride?: string;
        },
      ) => {
        void sessionId;
        void args;
        return 'agent-new';
      },
    ),
    setAgentConfig: vi.fn(async () => undefined),
    selectAgent: vi.fn(async () => undefined),
    setActiveLens: vi.fn(),
    publishPrReview: vi.fn(async () => ({ published: 1, stale: [], failed: [], mismatched: [] })),
    loadReviewDrafts: vi.fn(async () => undefined),
    openDiffLens: vi.fn(),
  };
  const useAppStore = Object.assign(<T,>(selector: (s: typeof state) => T) => selector(state), {
    getState: () => state,
  });
  return { state, useAppStore, showToast: vi.fn(), paneWidth: { current: 1200 } };
});

vi.mock('../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: h.useAppStore,
  useCurrentWorkspace: () => ({ id: 'workspace-1', name: 'goodboy' }),
  useDiffComments: (sessionId: string) => h.state.diffComments[sessionId] ?? [],
}));
vi.mock('../store/slices/github/activeProjectPrs', () => ({
  selectActiveProjectPrs: () => h.state.branchPrs,
}));
vi.mock('../features/github/components/GitHubStudio/CreatePrPanel', () => ({
  CreatePrPanel: () => <div data-testid="create-pr" />,
}));
vi.mock('../app/components/Toast', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));
vi.mock('../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    worktreePath: '/tmp/work',
    repoRoot: 'acme/web',
    branch: 'feature/retry',
  }),
}));
vi.mock('../shared/hooks/useSessionRoleModels', () => ({ useSessionRoleModels: () => ({}) }));
vi.mock('../features/integrations/github/useGithubConnection', () => ({
  useGithubConnection: () => ({ isResolved: true, isAuthenticated: true, refresh: vi.fn() }),
}));
vi.mock('../features/github/usePrDraftAgentRunning', () => ({
  usePrDraftAgentRunning: () => false,
}));
vi.mock('../features/session/hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));
vi.mock('../features/review/hooks/useConversationChanges', () => ({
  useConversationChanges: () => ({
    reported: [],
    reportedMissingShas: [],
    withinRunWindow: [],
    files: [],
    commitShaByFile: {},
    headSha: null,
    isLoading: false,
    reload: vi.fn(),
  }),
}));
vi.mock('../features/review/components/ReviewPane/WriteReview', () => ({
  WriteReview: () => <div data-testid="write-review" />,
}));
vi.mock('../shared/lib/editor', () => ({ openUrl: vi.fn(async () => undefined) }));

import { ReviewPane } from '../features/review/components/ReviewPane';

const SESSION = { id: 'session-1', workspaceId: 'workspace-1' } as unknown as Session;
const SESSION_ID = 'session-1';

const comment = ({
  id,
  threadId,
  path,
  line,
  resolved = false,
}: {
  readonly id: string;
  readonly threadId: string;
  readonly path: string;
  readonly line: number;
  readonly resolved?: boolean;
}): PrComment => ({
  id,
  author: 'dhh',
  authorAvatarUrl: null,
  body: `comment on ${path}`,
  createdAt: '2026-01-01T00:00:00Z',
  url: `https://github.com/acme/web/pull/248#discussion_${id}`,
  source: 'review',
  resolved,
  threadId,
  path,
  line,
});

const rowOf = (patch: Partial<ResolveThread>): ResolveThread =>
  ({
    stateReason: null,
    commitShas: null,
    activeAttemptId: null,
    disposition: null,
    replyDraft: null,
    question: null,
    replyPostedAt: null,
    replyId: null,
    closedSource: null,
    revision: 1,
    ...patch,
  }) as ResolveThread;

const attemptOf = (patch: Partial<ResolveAttempt>): ResolveAttempt =>
  ({
    id: 'attempt-1',
    agentId: 'agent-1' as AgentId,
    threadIds: ['t-one'],
    provider: 'anthropic',
    model: 'opus-5',
    effort: null,
    phase: 'running',
    startedAt: Date.now() - 60_000,
    endedAt: null,
    error: null,
    ...patch,
  }) as ResolveAttempt;

const previewOf = (patch: Partial<ResolvePublicationPreview>): ResolvePublicationPreview => ({
  publicationId: 'pub-1',
  repo: 'acme/web',
  prNumber: 248,
  branch: 'feature/retry',
  localHead: 'c3d4e5f0000',
  remoteHead: '9f8e7d60000',
  requiresPush: true,
  commits: [
    {
      sha: 'a1b2c3d0000',
      shortSha: 'a1b2c3d',
      subject: 'Add the early return',
      author: 'ak',
      timestamp: 0,
      pushed: false,
      parentSha: null,
      threadIds: ['t-one'],
    },
  ],
  replies: [{ threadId: 't-one', body: 'Added the early return.', revision: 1, closes: true }],
  excluded: [],
  blocker: null,
  ...patch,
});

const COMMENTS: ReadonlyArray<PrComment> = [
  comment({ id: '1', threadId: 't-one', path: 'src/retry.ts', line: 84 }),
  comment({ id: '2', threadId: 't-two', path: 'src/config.ts', line: 12 }),
  comment({ id: '3', threadId: 't-ask', path: 'src/client.ts', line: 18 }),
  comment({ id: '4', threadId: 't-fail', path: 'src/queue.ts', line: 40 }),
];

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
        isDraft: false,
        reviewDecision: null,
        body: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      detail: {
        prNumber: 248,
        comments: COMMENTS,
        reviews: [],
        reviewRequests: [],
        checks: [],
      },
      detailLoading: false,
      detailError: null,
    },
  };
  h.state.sessionResolveThreads = { [SESSION_ID]: [] };
  h.state.sessionResolveAttempts = { [SESSION_ID]: [] };
  h.state.sessionPhaseRuns = { [SESSION_ID]: [{ id: 'agent-1' }, { id: 'agent-2' }] };
  h.state.sessionOpenQuestions = { [SESSION_ID]: [] };
  h.state.activePublicationPreview = {};
  h.state.reviewDrafts = { [SESSION_ID]: [] };
  h.state.diffComments = { [SESSION_ID]: [] };
  h.state.reviewLensIntent = null;
  h.state.sessionSelectedPrNumber = {};
  h.state.sessionExternalTasks = {};
  h.state.branchPrs = [];
};

const readyRow = (threadId: string) =>
  rowOf({
    threadId,
    state: 'fixed',
    disposition: 'fix',
    commitShas: ['a1b2c3d'],
    replyDraft: 'Added the early return.',
  });

const withPreview = (preview: ResolvePublicationPreview) => {
  h.state.preparePublication.mockImplementation(async () => {
    h.state.activePublicationPreview = { [SESSION_ID]: preview };
    return preview;
  });
};

beforeEach(() => {
  seed();
  h.paneWidth.current = 1200;
  for (const value of Object.values(h.state)) {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as { mockClear: () => void }).mockClear();
    }
  }
  h.state.preparePublication.mockImplementation(async () => null);
  h.state.publishConversations.mockImplementation(async () => ({
    kind: 'done',
    pushed: true,
    resolved: 1,
    commented: 1,
    failed: 0,
  }));
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ contentRect: { width: h.paneWidth.current } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
      void target;
    }
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const listbox = () => screen.getByRole('listbox', { name: 'Review conversations' });
const optionNamed = (name: string) =>
  screen.getByRole('option', {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
  });

type CountedUser = {
  readonly click: (element: Element) => Promise<void>;
  readonly count: () => number;
};

const countedUser = (): CountedUser => {
  const user = userEvent.setup();
  let clicks = 0;
  return {
    click: async (element: Element) => {
      clicks += 1;
      await user.click(element);
    },
    count: () => clicks,
  };
};

describe('review flows end to end', () => {
  it('takes one conversation from Fix to Confirm publish in three clicks', async () => {
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Fix src/retry.ts:84' }));
    await waitFor(() => expect(h.state.spawnAgent).toHaveBeenCalledTimes(1));

    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };
    withPreview(previewOf({}));
    rerender(<ReviewPane session={SESSION} />);
    expect(within(listbox()).getByText('Ready 1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);
    expect(
      screen.getByText(/Push 1 commit to feature\/retry; post 1 reply; resolve 1 conversation\./),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));

    expect(user.count()).toBe(3);
    expect(listbox()).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('fixes everything and publishes the batch of results in three clicks', async () => {
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Fix all (4)' }));
    await waitFor(() => expect(h.state.spawnAgent).toHaveBeenCalled());
    expect(h.state.spawnAgent.mock.calls[0]?.[1].sourceThreadIds).toEqual([
      't-one',
      't-two',
      't-ask',
      't-fail',
    ]);

    h.state.sessionResolveThreads = {
      [SESSION_ID]: [readyRow('t-one'), readyRow('t-two')],
    };
    withPreview(
      previewOf({
        replies: [
          { threadId: 't-one', body: 'Added the early return.', revision: 1, closes: true },
          { threadId: 't-two', body: 'Renamed the flag.', revision: 1, closes: true },
        ],
        excluded: [{ threadId: 't-ask', reason: 'needs_you' }],
      }),
    );
    rerender(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Publish all (2)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);
    expect(screen.getByText('1 conversation needs you first.')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));

    expect(user.count()).toBe(3);
  });

  it('answers a question in place and publishes in four clicks', async () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [
        rowOf({
          threadId: 't-ask',
          state: 'needs_answer',
          stateReason: 'question',
          question: 'Which timeout applies?',
          activeAttemptId: 'attempt-2',
        }),
      ],
    };
    h.state.sessionResolveAttempts = {
      [SESSION_ID]: [
        attemptOf({
          id: 'attempt-2',
          agentId: 'agent-2' as AgentId,
          threadIds: ['t-ask'],
          phase: 'waiting',
        }),
      ],
    };
    h.state.sessionOpenQuestions = {
      [SESSION_ID]: [
        {
          id: 'q-1',
          sessionId: SESSION_ID,
          createdByAgentId: 'agent-2',
          text: 'Which timeout applies?',
          suggestedAnswers: ['socket timeout', 'request timeout'],
          userAnswer: null,
          status: 'open',
          createdAt: '2026-01-01T00:00:00Z',
        } as unknown as OpenQuestion,
      ],
    };
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(optionNamed('src/client.ts:18'));
    expect(screen.getAllByText('Which timeout applies?').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText('write your own answer…'), {
      target: { value: 'the socket timeout' },
    });
    await user.click(screen.getByRole('button', { name: /Send answer/ }));
    await waitFor(() => expect(h.state.answerOpenQuestions).toHaveBeenCalledTimes(1));
    expect(h.state.answerOpenQuestions.mock.calls[0]?.[1][0]?.answer).toBe('the socket timeout');
    expect(h.state.answerOpenQuestions.mock.calls[0]?.[2]).toBe('agent-2');

    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-ask')] };
    h.state.sessionResolveAttempts = { [SESSION_ID]: [] };
    h.state.sessionOpenQuestions = { [SESSION_ID]: [] };
    withPreview(
      previewOf({
        replies: [
          { threadId: 't-ask', body: 'Added the early return.', revision: 1, closes: true },
        ],
      }),
    );
    rerender(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));

    expect(user.count()).toBe(4);
  });

  it('retries a failed run and publishes in three clicks', async () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [
        rowOf({ threadId: 't-fail', state: 'failed', stateReason: 'the provider crashed' }),
      ],
    };
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Retry src/queue.ts:40' }));
    await waitFor(() => expect(h.state.spawnAgent).toHaveBeenCalledTimes(1));

    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-fail')] };
    withPreview(
      previewOf({
        replies: [
          { threadId: 't-fail', body: 'Added the early return.', revision: 1, closes: true },
        ],
      }),
    );
    rerender(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));

    expect(user.count()).toBe(3);
  });

  it('publishes a no-code-change answer in two clicks', async () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [
        rowOf({
          threadId: 't-two',
          state: 'answered',
          disposition: 'no_change',
          replyDraft: 'The guard already covers it.',
        }),
      ],
    };
    withPreview(
      previewOf({
        requiresPush: false,
        commits: [],
        replies: [
          { threadId: 't-two', body: 'The guard already covers it.', revision: 1, closes: true },
        ],
      }),
    );
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);
    expect(
      screen.getByText('Post 1 reply and resolve 1 conversation. No code will be pushed.'),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));

    expect(user.count()).toBe(2);
  });

  it('keeps a waiting attempt on screen after a restart, with no click needed', () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [rowOf({ threadId: 't-one', state: 'working', activeAttemptId: 'attempt-1' })],
    };
    h.state.sessionResolveAttempts = {
      [SESSION_ID]: [attemptOf({ phase: 'waiting', threadIds: ['t-one'] })],
    };

    render(<ReviewPane session={SESSION} />);

    expect(within(listbox()).getByText('Working 1')).toBeDefined();
    expect(h.state.loadResolveSession).toHaveBeenCalledWith({ sessionId: SESSION_ID });
  });

  it('keeps the question after a restart instead of inventing an answer', () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [
        rowOf({
          threadId: 't-ask',
          state: 'needs_answer',
          stateReason: 'question',
          question: 'Which timeout applies?',
        }),
      ],
    };

    render(<ReviewPane session={SESSION} />);

    expect(within(listbox()).getByText('Needs you 1')).toBeDefined();
    expect(screen.getAllByText('Which timeout applies?').length).toBeGreaterThan(0);
  });

  it('shows a publication caught mid-flight as publishing, with no publish verb', () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [rowOf({ threadId: 't-one', state: 'publishing', commitShas: ['a1b2c3d'] })],
    };

    render(<ReviewPane session={SESSION} />);

    expect(screen.getAllByText('Publishing').length).toBeGreaterThan(0);
    const publish = screen.getByRole('button', { name: 'Publish all (0)' });
    expect(publish.hasAttribute('disabled')).toBe(true);
  });

  it('offers Retry publish on a publication that failed before the restart', async () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [
        rowOf({
          threadId: 't-one',
          state: 'fixed',
          disposition: 'fix',
          commitShas: ['a1b2c3d'],
          replyDraft: 'Added the early return.',
          stateReason: `publication_failed:${JSON.stringify({ error: 'the push was rejected', reason: null })}`,
        }),
      ],
    };
    const user = countedUser();
    render(<ReviewPane session={SESSION} />);

    expect(screen.getByText(/Publish failed: the push was rejected/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Retry publish src/retry.ts:84' }));

    await waitFor(() => expect(h.state.retryPublication).toHaveBeenCalledTimes(1));
  });

  it('names the other session holding the pull request instead of publishing over it', async () => {
    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };
    withPreview(previewOf({ blocker: 'publication_in_progress' }));
    const user = countedUser();
    const { rerender } = render(<ReviewPane session={SESSION} />);

    await user.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);

    expect(screen.getByText('Another publication is in progress for #248')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirm publish' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(h.state.publishConversations).not.toHaveBeenCalled();
  });

  it('leaves the rows exactly as they were when the pull request cannot be reached', async () => {
    h.state.refreshSessionPrDetail.mockRejectedValue(new Error('offline'));
    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };
    const user = countedUser();
    render(<ReviewPane session={SESSION} />);

    const before = within(listbox()).getAllByRole('option').length;
    await user.click(screen.getByRole('button', { name: 'Refresh the pull request' }));
    await waitFor(() => expect(h.state.refreshSessionPrDetail).toHaveBeenCalled());

    expect(within(listbox()).getAllByRole('option').length).toBe(before);
    expect(within(listbox()).getByText('Ready 1')).toBeDefined();
    expect(h.state.updateResolveThread).not.toHaveBeenCalled();
    expect(within(listbox()).queryByText('Resolved 1')).toBeNull();
  });

  it('gates the working row pulse behind motion-safe rather than animating always', () => {
    h.state.sessionResolveThreads = {
      [SESSION_ID]: [rowOf({ threadId: 't-one', state: 'working', activeAttemptId: 'attempt-1' })],
    };
    h.state.sessionResolveAttempts = { [SESSION_ID]: [attemptOf({ threadIds: ['t-one'] })] };

    render(<ReviewPane session={SESSION} />);

    const row = optionNamed('src/retry.ts:84');
    expect(row.className).toContain('motion-safe:animate-border-pulse');
    expect(row.className).not.toMatch(/(^|\s)animate-border-pulse/);
  });

  it('renders the same list under a dark and a light root without a console error', () => {
    const errors: Array<unknown> = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };

    for (const theme of ['dark', 'light'] as const) {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(theme);
      const view = render(<ReviewPane session={SESSION} />);
      expect(within(listbox()).getByText('Ready 1')).toBeDefined();
      view.unmount();
    }

    document.documentElement.classList.remove('dark', 'light');
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it('hands a 600px pane one column and a way back to the list', async () => {
    h.paneWidth.current = 600;
    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };
    const user = countedUser();
    render(<ReviewPane session={SESSION} />);

    await user.click(optionNamed('src/retry.ts:84'));
    expect(screen.queryByRole('listbox', { name: 'Review conversations' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(listbox()).toBeDefined();
  });

  it('walks the whole list with the keyboard alone', () => {
    h.state.sessionResolveThreads = { [SESSION_ID]: [readyRow('t-one')] };
    render(<ReviewPane session={SESSION} />);
    const list = listbox();

    const seen = new Set<string>();
    for (let step = 0; step < COMMENTS.length; step += 1) {
      fireEvent.keyDown(list, { key: 'ArrowDown' });
      const active = list.getAttribute('aria-activedescendant');
      expect(active).not.toBeNull();
      seen.add(active ?? '');
    }

    expect(seen.size).toBe(COMMENTS.length);
  });
});
