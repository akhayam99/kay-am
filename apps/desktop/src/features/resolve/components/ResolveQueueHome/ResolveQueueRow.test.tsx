// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ResolveQueueRow as QueueRow } from '../../buildResolveQueueRows';
import { ResolveQueueRow } from './ResolveQueueRow';

const LONG_REQUEST = [
  'This retries forever on a 500 and the backoff never widens, so a flapping upstream',
  'turns into a stampede that we only notice from the dashboards hours later, which is',
  'exactly the failure mode we wrote the retry budget to prevent in the first place.',
].join(' ');

const rowOf = ({ body }: { readonly body: string }): QueueRow =>
  ({
    item: { id: 'item-1', approvalState: 'none', integratedSha: null },
    thread: { threadId: 't-retry', activeAttemptId: null },
    status: 'for_you',
    attempt: null,
    reviewerNote: {
      body,
      author: 'dhh',
      createdAtMs: 1,
      location: 'src/retry.ts:84',
      path: 'src/retry.ts',
      line: 84,
    },
    proposal: null,
    proposalKind: 'none',
    coveredThreadIds: [],
    delivery: null,
  }) as unknown as QueueRow;

const renderRow = ({ body, onOpen }: { readonly body: string; readonly onOpen: () => void }) =>
  render(
    <ul>
      <ResolveQueueRow
        row={rowOf({ body })}
        isSelected={false}
        onOpen={onOpen}
        onLater={vi.fn()}
        onResume={vi.fn()}
        onOpenCommit={vi.fn()}
      />
    </ul>,
  );

afterEach(cleanup);

describe('the resolve queue row', () => {
  it('opens the comment from the reviewer request itself', () => {
    const onOpen = vi.fn();
    renderRow({ body: LONG_REQUEST, onOpen });

    fireEvent.click(screen.getByText(LONG_REQUEST));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('expands the clamped request without opening the comment', () => {
    const onOpen = vi.fn();
    renderRow({ body: LONG_REQUEST, onOpen });

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the comment from a short request that carries no control', () => {
    const onOpen = vi.fn();
    renderRow({ body: 'Cap the attempts.', onOpen });

    fireEvent.click(screen.getByText('Cap the attempts.'));

    expect(onOpen).toHaveBeenCalledOnce();
  });
});
