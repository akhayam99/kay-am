// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Conversation } from '../../selectConversations';
import { useReviewSelection } from './index';

const conversationOf = ({
  threadId,
  badge,
  isPublishable = false,
}: {
  readonly threadId: string;
  readonly badge: Conversation['presentation']['badge'];
  readonly isPublishable?: boolean;
}): Conversation =>
  ({
    threadId,
    presentation: { badge, isPublishable },
  }) as Conversation;

const conversations: ReadonlyArray<Conversation> = [
  conversationOf({ threadId: 'open-1', badge: 'open' }),
  conversationOf({ threadId: 'open-2', badge: 'open' }),
  conversationOf({ threadId: 'ready-1', badge: 'ready', isPublishable: true }),
  conversationOf({ threadId: 'blocked', badge: 'ready', isPublishable: false }),
  conversationOf({ threadId: 'working-1', badge: 'working' }),
];

describe('useReviewSelection', () => {
  it('derives the two bulk counts from one set', () => {
    const { result } = renderHook(() => useReviewSelection({ conversations }));

    expect(result.current.openIds).toEqual(['open-1', 'open-2']);
    expect(result.current.readyIds).toEqual(['ready-1']);

    act(() => result.current.toggle('open-1'));
    act(() => result.current.toggle('ready-1'));

    expect(result.current.selectedOpenIds).toEqual(['open-1']);
    expect(result.current.selectedReadyIds).toEqual(['ready-1']);
  });

  it('keeps a ready conversation out of the publish set while it is blocked', () => {
    const { result } = renderHook(() => useReviewSelection({ conversations }));

    act(() => result.current.toggle('blocked'));

    expect(result.current.selected.has('blocked')).toBe(true);
    expect(result.current.selectedReadyIds).toEqual([]);
  });

  it('untoggles and clears', () => {
    const { result } = renderHook(() => useReviewSelection({ conversations }));

    act(() => result.current.toggle('open-1'));
    act(() => result.current.toggle('open-1'));
    expect(result.current.selected.size).toBe(0);

    act(() => result.current.toggle('open-2'));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it('survives a live update that moves a selected row into another group', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: ReadonlyArray<Conversation> }) =>
        useReviewSelection({ conversations: list }),
      { initialProps: { list: conversations } },
    );

    act(() => result.current.toggle('open-1'));
    rerender({
      list: [
        conversationOf({ threadId: 'open-1', badge: 'ready', isPublishable: true }),
        ...conversations.slice(1),
      ],
    });

    expect(result.current.selected.has('open-1')).toBe(true);
    expect(result.current.selectedReadyIds).toContain('open-1');
    expect(result.current.selectedOpenIds).toEqual([]);
  });
});
