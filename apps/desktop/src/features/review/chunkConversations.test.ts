import { describe, expect, it } from 'vitest';
import type { PrComment } from '@goodboy/types';
import type { CommentThread } from '../github/comment-threads';
import { chunkConversations } from './chunkConversations';

const threadOn = ({
  id,
  path,
  body = 'short',
}: {
  readonly id: string;
  readonly path: string;
  readonly body?: string;
}): CommentThread => ({
  head: {
    id,
    author: 'dhh',
    authorAvatarUrl: null,
    body,
    createdAt: '2026-01-01T00:00:00Z',
    url: `https://example.test/${id}`,
    source: 'review',
    threadId: id,
    path,
  } satisfies PrComment,
  replies: [],
});

const idsOf = (chunks: ReadonlyArray<ReadonlyArray<CommentThread>>) =>
  chunks.map((chunk) => chunk.map((thread) => thread.head.threadId));

describe('chunkConversations', () => {
  it('sends everything to one agent while it fits the cap', () => {
    const threads = Array.from({ length: 5 }, (_, index) =>
      threadOn({ id: `t${index}`, path: 'a.ts' }),
    );

    expect(chunkConversations({ threads })).toHaveLength(1);
  });

  it('splits 13 threads over two files by file, not by arbitrary cut', () => {
    const threads = [
      ...Array.from({ length: 7 }, (_, index) => threadOn({ id: `a${index}`, path: 'a.ts' })),
      ...Array.from({ length: 6 }, (_, index) => threadOn({ id: `b${index}`, path: 'b.ts' })),
    ];

    const chunks = chunkConversations({ threads });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.every((thread) => thread.head.path === 'a.ts')).toBe(true);
    expect(chunks[1]?.every((thread) => thread.head.path === 'b.ts')).toBe(true);
  });

  it('splits a single file by thread once it alone exceeds the cap', () => {
    const threads = Array.from({ length: 13 }, (_, index) =>
      threadOn({ id: `t${index}`, path: 'a.ts' }),
    );

    const chunks = chunkConversations({ threads });

    expect(chunks.map((chunk) => chunk.length)).toEqual([12, 1]);
  });

  it('lets a single oversized thread form its own chunk instead of dropping it', () => {
    const chunks = chunkConversations({
      threads: [threadOn({ id: 'big', path: 'a.ts', body: 'x'.repeat(10_000) })],
      contextWindow: 1000,
    });

    expect(idsOf(chunks)).toEqual([['big']]);
  });

  it('splits on the context window before it ever reaches the 12 cap', () => {
    const threads = Array.from({ length: 6 }, (_, index) =>
      threadOn({ id: `t${index}`, path: `f${index}.ts`, body: 'x'.repeat(4000) }),
    );

    const chunks = chunkConversations({ threads, contextWindow: 8000 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length < 12)).toBe(true);
    expect(chunks.flat()).toHaveLength(6);
  });

  it('returns nothing for an empty selection', () => {
    expect(chunkConversations({ threads: [] })).toEqual([]);
  });
});
