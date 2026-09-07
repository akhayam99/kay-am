import { useCallback, useMemo, useState } from 'react';
import type { Conversation } from '../../selectConversations';

type Params = { readonly conversations: ReadonlyArray<Conversation> };

export type ReviewSelection = {
  readonly selected: ReadonlySet<string>;
  readonly toggle: (threadId: string) => void;
  readonly clear: () => void;
  readonly openIds: ReadonlyArray<string>;
  readonly readyIds: ReadonlyArray<string>;
  readonly selectedOpenIds: ReadonlyArray<string>;
  readonly selectedReadyIds: ReadonlyArray<string>;
};

export const useReviewSelection = ({ conversations }: Params): ReviewSelection => {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const toggle = useCallback((threadId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
        return next;
      }
      next.add(threadId);
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set<string>()), []);
  return useMemo(() => {
    const openIds = conversations
      .filter((conversation) => conversation.presentation.badge === 'open')
      .map((conversation) => conversation.threadId);
    const readyIds = conversations
      .filter((conversation) => conversation.presentation.isPublishable)
      .map((conversation) => conversation.threadId);
    return {
      selected,
      toggle,
      clear,
      openIds,
      readyIds,
      selectedOpenIds: openIds.filter((threadId) => selected.has(threadId)),
      selectedReadyIds: readyIds.filter((threadId) => selected.has(threadId)),
    };
  }, [clear, conversations, selected, toggle]);
};
