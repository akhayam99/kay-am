// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  analysis: vi.fn<(text: string) => ReadonlyArray<unknown>>(() => []),
  resolved: vi.fn<(text: string) => ReadonlyArray<unknown>>(() => []),
  wontfix: vi.fn<(text: string) => ReadonlyArray<unknown>>(() => []),
  replies: vi.fn<(text: string) => ReadonlyArray<unknown>>(() => []),
  comments: [] as Array<{ threadId: string; resolved: boolean }>,
  rows: [] as Array<{ threadId: string; state: string }>,
  setReviewLensIntent: vi.fn(),
  setActiveLens: vi.fn(),
  openDiffLens: vi.fn(),
}));

vi.mock('@goodboy/core', () => ({
  extractAllCommentAnalysis: h.analysis,
  extractAllCommentResolved: h.resolved,
  extractAllCommentWontfix: h.wontfix,
  extractAllCommentReplies: h.replies,
  isReviewThreadId: (id: string) => /^PRRT_/.test(id),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(
    selector: (state: {
      sessionGithub: Record<string, { detail: { comments: typeof h.comments } | null }>;
      sessionResolveThreads: Record<string, typeof h.rows>;
      setReviewLensIntent: typeof h.setReviewLensIntent;
      setActiveLens: typeof h.setActiveLens;
      openDiffLens: typeof h.openDiffLens;
    }) => T,
  ) =>
    selector({
      sessionGithub: { s: { detail: { comments: h.comments } } },
      sessionResolveThreads: { s: h.rows },
      setReviewLensIntent: h.setReviewLensIntent,
      setActiveLens: h.setActiveLens,
      openDiffLens: h.openDiffLens,
    }),
}));

import { ResolverThreadsCard } from '.';

describe('ResolverThreadsCard', () => {
  beforeEach(() => {
    h.analysis.mockReset();
    h.analysis.mockReturnValue([]);
    h.resolved.mockReset();
    h.resolved.mockReturnValue([]);
    h.wontfix.mockReset();
    h.wontfix.mockReturnValue([]);
    h.replies.mockReset();
    h.replies.mockReturnValue([]);
    h.comments = [];
    h.rows = [];
    h.setReviewLensIntent.mockClear();
    h.setActiveLens.mockClear();
    h.openDiffLens.mockClear();
  });

  afterEach(cleanup);

  it('renders nothing without any comment marker', () => {
    const { container } = render(<ResolverThreadsCard assistantText="" sessionId={'s' as never} />);
    expect(container.firstChild).toBeNull();
  });

  it('reads as a single bare line for one thread, with no card chrome', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    render(
      <ResolverThreadsCard
        assistantText="x"
        sessionId={'s' as never}
        agentId={'agent-1' as never}
      />,
    );

    expect(screen.queryByTestId('resolver-threads-card')).toBeNull();
    expect(screen.getByTestId('resolver-thread-verdict')).toBeDefined();
    expect(screen.getByText('thread 1')).toBeDefined();
    expect(screen.getByText('fix committed locally')).toBeDefined();
  });

  it('groups multiple threads under one collapsed card', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    h.wontfix.mockReturnValue([{ threadId: 'PRRT_2', reason: 'already covered upstream' }]);

    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);

    expect(screen.getByTestId('resolver-threads-card')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('1 fixed · 1 no change')).toBeDefined();
    expect(screen.queryByText('thread 1')).toBeNull();
    expect(screen.queryByTestId('resolver-thread-verdict-0')).toBeNull();
  });

  it('expands the card to reveal one verdict line per thread', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    h.wontfix.mockReturnValue([{ threadId: 'PRRT_2', reason: 'already covered upstream' }]);

    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand resolver findings/ }));

    expect(screen.getByTestId('resolver-thread-verdict-0')).toBeDefined();
    expect(screen.getByTestId('resolver-thread-verdict-1')).toBeDefined();
    expect(screen.getByText('thread 1')).toBeDefined();
    expect(screen.getByText('thread 2')).toBeDefined();
    expect(screen.getByText('already covered upstream')).toBeDefined();
  });

  it('shows the commit sha as a chip that opens the commit in the files lens', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open commit abcdef1' }));

    expect(h.openDiffLens).toHaveBeenCalledWith('s', {
      kind: 'commit',
      sha: 'abcdef1234567890',
      path: null,
    });
  });

  it('renders the thread reply as markdown once the row is expanded', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    h.replies.mockReturnValue([
      { threadId: 'PRRT_1', body: 'Extracted the guard into `isReviewThreadId`.' },
    ]);

    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);
    const row = screen.getByTestId('resolver-thread-verdict');
    expect(within(row).queryByText('isReviewThreadId')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand thread 1' }));

    expect(within(row).getByText('isReviewThreadId').tagName).toBe('CODE');
    expect(row.textContent).not.toContain('<<');
  });

  it('leaves a row without a reply block unexpandable', () => {
    h.wontfix.mockReturnValue([{ threadId: 'PRRT_2', reason: 'already covered upstream' }]);

    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);

    expect(screen.queryByRole('button', { name: /Expand thread/ })).toBeNull();
  });

  it('sends a verdict line to that conversation in Review', () => {
    h.resolved.mockReturnValue([{ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }]);
    h.wontfix.mockReturnValue([{ threadId: 'PRRT_2', reason: 'already covered upstream' }]);

    render(
      <ResolverThreadsCard
        assistantText="x"
        sessionId={'s' as never}
        agentId={'agent-1' as never}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Expand resolver findings/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open thread 2 in Review' }));

    expect(h.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: 's', threadId: 'PRRT_1' },
    });
    expect(h.setActiveLens).toHaveBeenCalledWith('s', 'review');
  });

  it('stays navigable even when the transcript card knows no agent', () => {
    h.wontfix.mockReturnValue([{ threadId: 'PRRT_2', reason: 'already covered upstream' }]);
    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);

    const row = screen.getByTestId('resolver-thread-verdict');
    fireEvent.click(within(row).getByRole('button', { name: 'Open thread 1 in Review' }));

    expect(h.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: 's', threadId: 'PRRT_2' },
    });
  });

  it('reflects a github-resolved thread and a queued local fix in the verdict text', () => {
    h.resolved.mockReturnValue([
      { threadId: 'PRRT_1', commitSha: 'abcdef1234567890' },
      { threadId: 'PRRT_2', commitSha: '1234567890abcdef' },
    ]);
    h.comments = [{ threadId: 'PRRT_1', resolved: true }];
    h.rows = [{ threadId: 'PRRT_2', state: 'publishing' }];

    render(<ResolverThreadsCard assistantText="x" sessionId={'s' as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Expand resolver findings/ }));

    expect(screen.getByText('fix committed, thread closed')).toBeDefined();
    expect(screen.getByText('fix committed, reply queued')).toBeDefined();
  });
});
