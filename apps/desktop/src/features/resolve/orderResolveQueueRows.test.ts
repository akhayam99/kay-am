import { describe, expect, it } from 'vitest';
import type { ResolveQueueRow } from './buildResolveQueueRows';
import { orderResolveQueueRows, resolveQueueNeighbours } from './orderResolveQueueRows';

const rowOf = ({ threadId }: { readonly threadId: string }): ResolveQueueRow =>
  ({
    item: { id: `item-${threadId}` },
    thread: { threadId },
    status: 'for_you',
    attempt: null,
    reviewerNote: null,
    proposal: null,
    coveredThreadIds: [],
  }) as unknown as ResolveQueueRow;

const idsOf = ({
  rows,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
}): ReadonlyArray<string> => rows.map((row) => row.thread.threadId);

describe('resolve queue ordering', () => {
  it('appends what arrived while the user was away rather than reordering underneath them', () => {
    const rows = [rowOf({ threadId: 'new' }), rowOf({ threadId: 'b' }), rowOf({ threadId: 'a' })];

    expect(idsOf({ rows: orderResolveQueueRows({ rows, pinned: ['a', 'b'] }) })).toEqual([
      'a',
      'b',
      'new',
    ]);
  });

  it('drops a pinned row that is gone without disturbing the rest', () => {
    const rows = [rowOf({ threadId: 'b' }), rowOf({ threadId: 'c' })];

    expect(idsOf({ rows: orderResolveQueueRows({ rows, pinned: ['a', 'b'] }) })).toEqual([
      'b',
      'c',
    ]);
  });

  it('leaves the natural order alone when nothing is pinned', () => {
    const rows = [rowOf({ threadId: 'b' }), rowOf({ threadId: 'a' })];

    expect(idsOf({ rows: orderResolveQueueRows({ rows, pinned: [] }) })).toEqual(['b', 'a']);
  });

  it('reads the previous and next item off the order the user sees', () => {
    const rows = [rowOf({ threadId: 'a' }), rowOf({ threadId: 'b' }), rowOf({ threadId: 'c' })];

    expect(resolveQueueNeighbours({ rows, threadId: 'b' })).toEqual({
      index: 1,
      previousThreadId: 'a',
      nextThreadId: 'c',
    });
    expect(resolveQueueNeighbours({ rows, threadId: 'missing' })).toEqual({
      index: -1,
      previousThreadId: null,
      nextThreadId: null,
    });
  });
});
