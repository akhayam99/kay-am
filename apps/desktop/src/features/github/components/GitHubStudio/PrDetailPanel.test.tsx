import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PrDetail, PullRequestState, SessionId, WorkspaceId } from '@goodboy/types';

type Store = {
  readonly sessions: ReadonlyArray<{
    readonly id: SessionId;
    readonly workspaceId: WorkspaceId;
    readonly goal: string;
    readonly activeProjectId?: string;
  }>;
  readonly projects: ReadonlyArray<{ readonly id: string; readonly kind: string }>;
  readonly sessionProjectMounts: Record<
    string,
    ReadonlyArray<{
      readonly projectId: string;
      readonly mountName: string | null;
      readonly worktreePath: string;
      readonly repoRoot: string;
      readonly branch: string;
    }>
  >;
  readonly sessionActiveProject: Record<string, string>;
  readonly workspaces: ReadonlyArray<{
    readonly id: WorkspaceId;
    readonly rootPath: string;
  }>;
  readonly sessionGithub: Record<
    string,
    {
      readonly pr: PullRequestState | null;
      readonly detail: PrDetail | null;
      readonly detailLoading: boolean;
      readonly detailError: string | null;
    }
  >;
  readonly sessionProjectPrs: Record<
    string,
    Readonly<Record<string, ReadonlyArray<PullRequestState>>>
  >;
  readonly sessionSelectedPrNumber: Record<string, number | null>;
  readonly sessionPhaseRuns: Record<
    string,
    ReadonlyArray<{ readonly name: string; readonly status: string }>
  >;
  readonly sessionBranches: Record<string, string>;
  readonly refreshSessionPrDetail: ReturnType<typeof vi.fn>;
  readonly refreshSessionPr: ReturnType<typeof vi.fn>;
  readonly selectSessionPr: ReturnType<typeof vi.fn>;
  readonly markPrReady: ReturnType<typeof vi.fn>;
  readonly convertPrToDraft: ReturnType<typeof vi.fn>;
  readonly mergePr: ReturnType<typeof vi.fn>;
  readonly closePr: ReturnType<typeof vi.fn>;
  readonly reopenPr: ReturnType<typeof vi.fn>;
  readonly requestReview: ReturnType<typeof vi.fn>;
  readonly publishPrReview: ReturnType<typeof vi.fn>;
  readonly editPr: ReturnType<typeof vi.fn>;
  readonly spawnAgent: ReturnType<typeof vi.fn>;
  readonly selectAgent: ReturnType<typeof vi.fn>;
  readonly setCurrentSession: ReturnType<typeof vi.fn>;
  readonly setActiveLens: ReturnType<typeof vi.fn>;
  readonly setAgentConfig: ReturnType<typeof vi.fn>;
  readonly sessionCreations: Record<string, ReadonlyArray<{ readonly kind: string }>>;
};

const h = vi.hoisted(() => {
  const sessionId = 'session-1' as SessionId;
  const workspaceId = 'workspace-1' as WorkspaceId;
  const pr = {
    number: 42,
    title: 'Bring pull requests onto shared chrome',
    url: 'https://github.com/goodboy/goodboy/pull/42',
    state: 'open',
    mergeable: true,
    checks: 'success',
    baseBranch: 'main',
    headBranch: 'ak/shared-pr-chrome',
    isDraft: false,
    reviewDecision: null,
    body: 'Use the shared studio identity treatment.',
    updatedAt: '2026-07-30T10:00:00Z',
  } satisfies PullRequestState;
  const secondPr = {
    ...pr,
    number: 43,
    title: 'Follow-up pull request',
    url: 'https://github.com/goodboy/goodboy/pull/43',
  } satisfies PullRequestState;
  const detail = {
    prNumber: pr.number,
    comments: [],
    reviews: [],
    reviewRequests: [],
    checks: [],
  } satisfies PrDetail;

  const thread = {
    head: {
      id: 'comment-1',
      threadId: 'PRRT_1',
      author: 'reviewer',
      path: 'apps/desktop/src/index.ts',
      line: 12,
      url: 'https://github.com/goodboy/goodboy/pull/42#discussion_r1',
      body: 'rename this helper',
      source: 'review',
      resolved: false,
    },
    replies: [],
  };

  return {
    sessionId,
    pr,
    secondPr,
    detail,
    thread,
    showToast: vi.fn(),
    prs: [] as ReadonlyArray<PullRequestState>,
    store: {
      sessions: [
        {
          id: sessionId,
          workspaceId,
          goal: 'Improve the PR studio',
        },
      ],
      workspaces: [{ id: workspaceId, rootPath: '/repo' }],
      projects: [{ id: 'project-1', kind: 'repo' }],
      sessionProjectMounts: {
        [sessionId]: [
          {
            projectId: 'project-1',
            mountName: null,
            worktreePath: '/repo/.wt/shared-pr-chrome',
            repoRoot: '/repo',
            branch: 'ak/shared-pr-chrome',
          },
        ],
      },
      sessionActiveProject: { [sessionId]: 'project-1' },
      sessionGithub: {
        [sessionId]: {
          pr,
          detail,
          detailLoading: false,
          detailError: null,
        },
      },
      sessionProjectPrs: { [sessionId]: { 'project-1': [pr] } },
      sessionSelectedPrNumber: {},
      sessionPhaseRuns: {},
      sessionBranches: { [sessionId]: pr.headBranch },
      refreshSessionPrDetail: vi.fn(async () => undefined),
      refreshSessionPr: vi.fn(async () => undefined),
      selectSessionPr: vi.fn(async () => undefined),
      markPrReady: vi.fn(async () => undefined),
      convertPrToDraft: vi.fn(async () => undefined),
      mergePr: vi.fn(async () => undefined),
      closePr: vi.fn(async () => undefined),
      reopenPr: vi.fn(async () => undefined),
      requestReview: vi.fn(async () => undefined),
      publishPrReview: vi.fn(
        async (): Promise<{
          published: number;
          stale: ReadonlyArray<{ id: string }>;
          failed: ReadonlyArray<{ draft: { id: string }; error: string }>;
          mismatched: ReadonlyArray<{ id: string }>;
        }> => ({ published: 0, stale: [], failed: [], mismatched: [] }),
      ),
      editPr: vi.fn(async () => undefined),
      spawnAgent: vi.fn(async () => 'agent-1'),
      selectAgent: vi.fn(async () => undefined),
      setCurrentSession: vi.fn(async () => undefined),
      setActiveLens: vi.fn(),
      setAgentConfig: vi.fn(async () => undefined),
      sessionCreations: {},
    } satisfies Store,
  };
});

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (state: Store) => T) => selector(h.store),
  useCurrentWorkspace: () => h.store.workspaces[0] ?? null,
  useSessions: () => h.store.sessions,
}));

vi.mock('../../github', () => ({
  ghPrDetailByNumber: vi.fn(async () => h.detail),
  ghPrsForBranch: vi.fn(async () => h.prs),
  ghRepoCollaborators: vi.fn(async () => []),
}));

vi.mock('../../../session/hooks/useResolverIndex', () => ({
  useResolverIndex: () => ({
    links: [],
    byThreadId: new Map(),
    byCommentUrl: new Map(),
    byDiffAgentId: new Map(),
  }),
}));

vi.mock('../../../../shared/hooks/useSessionRoleModels', () => ({
  useSessionRoleModels: () => null,
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

vi.mock('./PrActionBar', () => ({
  PrActionBar: ({
    onSubmitVerdict,
  }: {
    readonly onSubmitVerdict: (submission: { verdict: string; body: string }) => void;
  }) => (
    <div>
      Pull request actions
      <button
        type="button"
        onClick={() => onSubmitVerdict({ verdict: 'approve', body: 'ship it' })}
      >
        Approve pull request
      </button>
    </div>
  ),
}));

vi.mock('./PrConversation', () => ({
  PrConversation: () => <div>Conversation body</div>,
}));

vi.mock('./PrChecks', () => ({
  PrChecks: () => <div>Checks body</div>,
}));

vi.mock('./CreatePrPanel', () => ({
  CreatePrPanel: () => <div>Create pull request</div>,
}));

import { PrDetailPanel } from './PrDetailPanel';

const renderPanel = () => render(<PrDetailPanel sessionId={h.sessionId} onClose={vi.fn()} />);

beforeEach(() => {
  h.store.sessionCreations = {};
  h.store.spawnAgent.mockClear();
  h.store.selectAgent.mockClear();
  h.store.setActiveLens.mockClear();
  h.store.setCurrentSession.mockClear();
  h.prs = [h.pr];
  h.store.sessionProjectPrs = { [h.sessionId]: { 'project-1': [h.pr] } };
  h.store.sessionSelectedPrNumber = {};
  h.store.selectSessionPr.mockClear();
  h.store.publishPrReview.mockClear();
  h.showToast.mockClear();
});

afterEach(cleanup);

describe('PrDetailPanel', () => {
  it('renders the title in the header band and a read-only editable field', () => {
    renderPanel();

    expect(screen.getByText('#42')).toBeDefined();
    expect(screen.getByRole('heading', { name: h.pr.title })).toBeDefined();

    const titleField = screen.getByRole('button', { name: h.pr.title });
    expect(titleField.closest('h1, h2, h3, h4, h5, h6')).toBeNull();
    fireEvent.click(titleField);

    expect(screen.getByDisplayValue(h.pr.title).tagName).toBe('INPUT');
  });

  it('switches the active section body through the tablist', () => {
    renderPanel();

    const tablist = screen.getByRole('tablist', { name: 'Pull request sections' });
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Overview', 'Conversation', 'Checks']);
    expect(
      within(tablist).getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText(h.pr.body)).toBeDefined();

    fireEvent.click(within(tablist).getByRole('tab', { name: 'Conversation' }));

    expect(
      within(tablist).getByRole('tab', { name: 'Conversation' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.queryByText(h.pr.body)).toBeNull();
    expect(screen.getByText('Conversation body')).toBeDefined();
  });

  it('keeps the reviewers and metadata rail readable across sections', () => {
    renderPanel();

    const tablist = screen.getByRole('tablist', { name: 'Pull request sections' });
    expect(screen.getByText('Reviewers')).toBeDefined();
    expect(screen.getByText('Base branch')).toBeDefined();

    fireEvent.click(within(tablist).getByRole('tab', { name: 'Checks' }));

    expect(screen.getByText('Checks body')).toBeDefined();
    expect(screen.getByText('Reviewers')).toBeDefined();
  });

  it('shows the pull request switcher only when multiple pull requests are available', async () => {
    const firstRender = renderPanel();

    expect(screen.queryByTitle('2 pull requests on this branch')).toBeNull();

    firstRender.unmount();
    h.store.sessionProjectPrs = { [h.sessionId]: { 'project-1': [h.pr, h.secondPr] } };
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTitle('2 pull requests on this branch')).toBeDefined();
    });
  });

  it('selects the requested pull request even without a comment thread', () => {
    h.store.sessionProjectPrs = { [h.sessionId]: { 'project-1': [h.pr, h.secondPr] } };

    render(
      <PrDetailPanel
        sessionId={h.sessionId}
        initialPrNumber={h.secondPr.number}
        onClose={vi.fn()}
      />,
    );

    expect(h.store.selectSessionPr).toHaveBeenCalledWith(h.sessionId, h.secondPr.number);
  });

  it('publishes the verdict against the pull request selected in the panel', async () => {
    h.store.sessionProjectPrs = { [h.sessionId]: { 'project-1': [h.pr, h.secondPr] } };
    h.store.sessionSelectedPrNumber = { [h.sessionId]: h.secondPr.number };

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Approve pull request' }));

    await waitFor(() => expect(h.store.publishPrReview).toHaveBeenCalledOnce());
    expect(h.store.publishPrReview).toHaveBeenCalledWith(h.sessionId, {
      verdict: 'approve',
      body: 'ship it',
      target: { provider: 'github', repo: 'goodboy/goodboy', prNumber: h.secondPr.number },
    });
    await waitFor(() =>
      expect(h.showToast).toHaveBeenCalledWith('success', 'Pull request approved'),
    );
  });

  it('never claims success when the publish reports failed comments', async () => {
    h.store.publishPrReview.mockResolvedValueOnce({
      published: 0,
      stale: [],
      failed: [{ draft: { id: 'draft-1' }, error: 'resource not accessible by integration' }],
      mismatched: [],
    });

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Approve pull request' }));

    await waitFor(() =>
      expect(h.showToast).toHaveBeenCalledWith(
        'error',
        'Review not posted: resource not accessible by integration',
      ),
    );
    expect(h.showToast).not.toHaveBeenCalledWith('success', expect.anything());
  });

  it('drives the active pr and switcher selection through store state', () => {
    h.store.sessionProjectPrs = { [h.sessionId]: { 'project-1': [h.pr, h.secondPr] } };
    h.store.sessionSelectedPrNumber = { [h.sessionId]: h.secondPr.number };

    renderPanel();

    expect(screen.getByRole('heading', { name: h.secondPr.title })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /#43 of 2/i }));
    fireEvent.click(screen.getByRole('option', { name: /#42/i }));
    expect(h.store.selectSessionPr).toHaveBeenCalledWith(h.sessionId, h.pr.number);
  });
});
