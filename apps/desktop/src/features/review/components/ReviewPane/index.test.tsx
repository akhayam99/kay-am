// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    sessionResolveThreads: {} as Record<string, ReadonlyArray<unknown>>,
    sessionResolveAttempts: {} as Record<string, ReadonlyArray<unknown>>,
    activePublicationPreview: {} as Record<string, unknown>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    sessionOpenQuestions: {} as Record<string, ReadonlyArray<unknown>>,
    reviewDrafts: {} as Record<string, ReadonlyArray<unknown>>,
    diffComments: {} as Record<string, ReadonlyArray<unknown>>,
    reviewLensIntent: null as { sessionId: string; threadId?: string } | null,
    setReviewLensIntent: vi.fn(),
    loadResolveSession: vi.fn(async () => undefined),
    refreshSessionPrDetail: vi.fn(async () => undefined),
    preparePublication: vi.fn(async () => null as unknown),
    publishConversations: vi.fn(
      async (params: { readonly sessionId: string; readonly publicationId: string }) => {
        void params;
        return { kind: 'done', pushed: true, resolved: 1, commented: 1, failed: 0 };
      },
    ),
    retryPublication: vi.fn(async () => null as unknown),
    cancelPublication: vi.fn(async () => undefined),
    cancelResolveAttempt: vi.fn(async () => undefined),
    forceCloseResolver: vi.fn(async (sessionId: string, agentId: string) => {
      void sessionId;
      void agentId;
    }),
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

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: h.useAppStore,
  useDiffComments: (sessionId: string) => h.state.diffComments[sessionId] ?? [],
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
vi.mock('../../../session/hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));
vi.mock('../../hooks/useConversationChanges', () => ({
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
    agentId: 'agent-1',
    threadIds: ['t-work-a', 't-work-b'],
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
  commits: [],
  replies: [{ threadId: 't-ready', body: 'Added the early return.', revision: 1, closes: true }],
  excluded: [],
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
        isDraft: false,
        reviewDecision: null,
        body: '',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      detail: {
        prNumber: 248,
        comments: [
          comment({ id: '1', threadId: 't-open', path: 'src/config.ts', line: 12 }),
          comment({ id: '2', threadId: 't-ready', path: 'src/retry.ts', line: 84 }),
          comment({ id: '3', threadId: 't-needs', path: 'src/client.ts', line: 18 }),
          comment({ id: '4', threadId: 't-work-a', path: 'src/worker.ts', line: 9 }),
          comment({ id: '5', threadId: 't-work-b', path: 'src/queue.ts', line: 40 }),
        ],
        reviews: [],
        reviewRequests: [],
        checks: [],
      },
      detailLoading: false,
      detailError: null,
    },
  };
  h.state.sessionResolveThreads = {
    [SESSION_ID]: [
      rowOf({
        threadId: 't-ready',
        state: 'fixed',
        disposition: 'fix',
        commitShas: ['a1b2c3d'],
        replyDraft: 'Added the early return.',
      }),
      rowOf({
        threadId: 't-needs',
        state: 'needs_answer',
        stateReason: 'question',
        question: 'Which timeout applies?',
        activeAttemptId: 'attempt-2',
      }),
      rowOf({ threadId: 't-work-a', state: 'working', activeAttemptId: 'attempt-1' }),
      rowOf({ threadId: 't-work-b', state: 'working', activeAttemptId: 'attempt-1' }),
    ],
  };
  h.state.sessionResolveAttempts = {
    [SESSION_ID]: [
      attemptOf({}),
      attemptOf({
        id: 'attempt-2',
        agentId: 'agent-2' as AgentId,
        threadIds: ['t-needs'],
        phase: 'waiting',
      }),
    ],
  };
  h.state.sessionPhaseRuns = { [SESSION_ID]: [{ id: 'agent-1' }, { id: 'agent-2' }] };
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
  h.state.activePublicationPreview = {};
  h.state.reviewDrafts = { [SESSION_ID]: [] };
  h.state.diffComments = { [SESSION_ID]: [] };
  h.state.reviewLensIntent = null;
};

beforeEach(() => {
  seed();
  h.paneWidth.current = 1200;
  for (const value of Object.values(h.state)) {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as { mockClear: () => void }).mockClear();
    }
  }
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

describe('ReviewPane', () => {
  it('shows one group per state, in the order the reader needs them', () => {
    render(<ReviewPane session={SESSION} />);

    const labels = within(listbox())
      .getAllByText(/^(Needs you|Working|Ready|Open) \d$/)
      .map((node) => node.textContent);
    expect(labels).toEqual(['Needs you 1', 'Working 2', 'Ready 1', 'Open 1']);
  });

  it('counts only open conversations in Fix all and starts one shared attempt through spawnAgent', async () => {
    render(<ReviewPane session={SESSION} />);

    const fixAll = screen.getByRole('button', { name: 'Fix all (1)' });
    fireEvent.click(fixAll);

    await waitFor(() => expect(h.state.spawnAgent).toHaveBeenCalledTimes(1));
    expect(h.state.spawnAgent.mock.calls[0]?.[1].sourceThreadIds).toEqual(['t-open']);
    expect(h.state.spawnAgent.mock.calls[0]?.[1].kindOverride).toBe('resolver');
  });

  it('fixes a single conversation from its row action', async () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fix src/config.ts:12' }));

    await waitFor(() => expect(h.state.spawnAgent).toHaveBeenCalledTimes(1));
  });

  it('opens the detail of the row you click and keeps the list on screen', () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(optionNamed('src/retry.ts:84'));

    expect(screen.getByRole('heading', { name: 'src/retry.ts:84' })).toBeDefined();
    expect(screen.getByText('Added the early return.')).toBeDefined();
    expect(listbox()).toBeDefined();
  });

  it('lets the checkbox change the publish counts without moving the focused row', () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(optionNamed('src/config.ts:12'));
    expect(screen.getByRole('heading', { name: 'src/config.ts:12' })).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select src/retry.ts:84' }));

    expect(screen.getByRole('button', { name: 'Publish selected (1)' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'src/config.ts:12' })).toBeDefined();
  });

  it('answers a question in place and resumes the agent that asked it', async () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(optionNamed('src/client.ts:18'));
    fireEvent.click(screen.getByRole('radio', { name: /socket timeout/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send answer/ }));

    await waitFor(() => expect(h.state.answerOpenQuestions).toHaveBeenCalledTimes(1));
    expect(h.state.answerOpenQuestions.mock.calls[0]?.[1][0]?.answer).toBe('socket timeout');
    expect(h.state.answerOpenQuestions.mock.calls[0]?.[2]).toBe('agent-2');
  });

  it('names the shared scope before stopping a run and stops it once', async () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(optionNamed('src/worker.ts:9'));
    fireEvent.click(screen.getByRole('button', { name: 'More conversation actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop run' }));

    expect(screen.getByText('Stop work on 2 conversations?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(h.state.forceCloseResolver).toHaveBeenCalledTimes(1));
    expect(h.state.forceCloseResolver.mock.calls[0]?.[1]).toBe('agent-1');
  });

  it('previews a publication, then confirms it', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    const { rerender } = render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ReviewPane session={SESSION} />);

    expect(screen.getByText(/Push 0 commits to feature\/retry/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }));

    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));
    expect(h.state.publishConversations.mock.calls[0]?.[0]).toMatchObject({
      publicationId: 'pub-1',
    });
  });

  it('warns and re-renders the preview when the snapshot went stale', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    h.state.publishConversations.mockResolvedValueOnce({
      kind: 'stale',
      preview: previewOf({}),
    } as never);
    const { rerender } = render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalled());
    rerender(<ReviewPane session={SESSION} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm publish' }));

    await waitFor(() =>
      expect(screen.getByText('Something changed, here is the updated preview')).toBeDefined(),
    );
  });

  it('moves the active option down across group boundaries with the arrow keys', () => {
    render(<ReviewPane session={SESSION} />);
    const list = listbox();

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    const first = list.getAttribute('aria-activedescendant');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    const second = list.getAttribute('aria-activedescendant');

    expect(first).not.toBeNull();
    expect(second).not.toBe(first);
    fireEvent.keyDown(list, { key: 'End' });
    expect(list.getAttribute('aria-activedescendant')).not.toBe(second);
  });

  it('collapses to one column below 720px and offers a way back to the list', () => {
    h.paneWidth.current = 600;
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(optionNamed('src/retry.ts:84'));

    expect(screen.queryByRole('listbox', { name: 'Review conversations' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
    expect(listbox()).toBeDefined();
  });

  it('keeps the Write review flow reachable from the dock', () => {
    render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Write review' }));

    expect(screen.getByTestId('write-review')).toBeDefined();
  });

  it('never opens a dialog on any primary path', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    const { rerender } = render(<ReviewPane session={SESSION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fix all (1)' }));
    fireEvent.click(optionNamed('src/worker.ts:9'));
    fireEvent.click(screen.getByRole('button', { name: 'More conversation actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop run' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish all (1)' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalled());
    rerender(<ReviewPane session={SESSION} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses the conversation an intent points at', () => {
    h.state.reviewLensIntent = { sessionId: SESSION_ID, threadId: 't-ready' };
    render(<ReviewPane session={SESSION} />);

    expect(screen.getByRole('heading', { name: 'src/retry.ts:84' })).toBeDefined();
    expect(h.state.setReviewLensIntent).toHaveBeenCalledWith({ intent: null });
  });
});
