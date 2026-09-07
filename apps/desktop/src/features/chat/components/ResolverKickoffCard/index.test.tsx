import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IsoDateTime, PrComment, PullRequestState, TurnEvent } from '@goodboy/types';
import { buildCombinedCommentAgentArgs } from '../../spawn-from-comment';
import { reduceTranscript } from '../../utils/transcript-items';
import { ResolverKickoffCard } from '.';

const openUrl = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../../../shared/lib/editor', () => ({ openUrl }));

const PR: PullRequestState = {
  number: 9108,
  title: 'resolve: foo',
  url: 'https://github.com/o/r/pull/9108',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'kay/foo',
  isDraft: false,
  reviewDecision: 'changes_requested',
  body: '',
  updatedAt: '2026-05-15T00:00:00Z',
};

const comment = (over: Partial<PrComment> = {}): PrComment => ({
  id: 'review-1',
  author: 'alice',
  authorAvatarUrl: null,
  body: 'this should use a helper',
  createdAt: '2026-05-15T10:00:00Z',
  url: 'https://github.com/o/r/pull/9108#discussion_r1',
  source: 'review',
  path: 'src/foo.ts',
  line: 42,
  resolved: false,
  threadId: 'PRRT_1',
  ...over,
});

const kickoffText = () =>
  buildCombinedCommentAgentArgs(
    [
      { head: comment(), replies: [] },
      {
        head: comment({
          id: 'review-2',
          threadId: 'PRRT_2',
          author: 'carol',
          path: 'src/bar.ts',
          line: 7,
          body: 'this name does not match the folder',
          url: 'https://github.com/o/r/pull/9108#discussion_r2',
        }),
        replies: [],
      },
    ],
    PR,
  ).initialPrompt;

const kickoffItem = () => {
  const events: ReadonlyArray<TurnEvent> = [
    {
      kind: 'user_text',
      runId: 'run-1',
      at: '2026-05-15T10:00:00.000Z' as IsoDateTime,
      text: kickoffText(),
    } as TurnEvent,
  ];
  const [item] = reduceTranscript(events);
  if (item === undefined || item.kind !== 'resolver_kickoff') {
    throw new Error(`expected a resolver kickoff item, got ${item?.kind ?? 'nothing'}`);
  }
  return item;
};

afterEach(() => {
  cleanup();
  openUrl.mockClear();
});

describe('ResolverKickoffCard', () => {
  it('reads the spawned resolver as one card per thread instead of a user message', () => {
    const item = kickoffItem();
    expect(item.threads).toHaveLength(2);

    render(<ResolverKickoffCard item={item} />);

    const cards = screen.getAllByTestId('resolver-kickoff-thread');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('src/foo.ts:42')).toBeDefined();
    expect(screen.getByText('src/bar.ts:7')).toBeDefined();
    expect(screen.getByText(/alice/)).toBeDefined();
    expect(screen.getByText(/carol/)).toBeDefined();
    expect(screen.getByText('this should use a helper')).toBeDefined();
    expect(screen.getByText('this name does not match the folder')).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Open on GitHub/ })).toHaveLength(2);
  });

  it('keeps the full instructions collapsed and never first in the transcript', () => {
    const { container } = render(<ResolverKickoffCard item={kickoffItem()} />);

    expect(screen.queryByText(/How to report each thread/)).toBeNull();
    expect(container.textContent).not.toContain('comment-resolved');

    const firstThread = screen.getAllByTestId('resolver-kickoff-thread')[0]!;
    const instructions = screen.getByTestId('resolver-kickoff-instructions');
    expect(firstThread.compareDocumentPosition(instructions)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('hands the whole prompt over on demand, with every marker fenced as code', () => {
    const { container } = render(<ResolverKickoffCard item={kickoffItem()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand resolve instructions' }));

    expect(screen.getByText(/How to report each thread/)).toBeDefined();
    expect(container.querySelectorAll('code').length).toBeGreaterThan(0);
    expect(
      [...container.querySelectorAll('code')].some((node) =>
        node.textContent?.includes('comment-resolved'),
      ),
    ).toBe(true);
  });

  it('opens the thread it names on GitHub', () => {
    render(<ResolverKickoffCard item={kickoffItem()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Open on GitHub/ })[1]!);

    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/9108#discussion_r2');
  });
});
