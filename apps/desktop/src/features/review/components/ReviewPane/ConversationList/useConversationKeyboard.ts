import { useCallback, type KeyboardEvent } from 'react';
import type { Conversation } from '../../../selectConversations';

type Params = {
  readonly conversations: ReadonlyArray<Conversation>;
  readonly focusedThreadId: string | null;
  readonly onFocus: (threadId: string) => void;
  readonly onToggleCheck: (threadId: string) => void;
  readonly onOpen: (threadId: string) => void;
};

export type ConversationKeyboard = {
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

export const useConversationKeyboard = ({
  conversations,
  focusedThreadId,
  onFocus,
  onToggleCheck,
  onOpen,
}: Params): ConversationKeyboard => {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (conversations.length === 0) {
        return;
      }
      const index = conversations.findIndex(
        (conversation) => conversation.threadId === focusedThreadId,
      );
      const move = (next: number) => {
        const clamped = Math.min(Math.max(next, 0), conversations.length - 1);
        const target = conversations[clamped];
        if (target === undefined) {
          return;
        }
        event.preventDefault();
        onFocus(target.threadId);
      };
      if (event.key === 'ArrowDown') {
        move(index + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        move(index === -1 ? 0 : index - 1);
        return;
      }
      if (event.key === 'Home') {
        move(0);
        return;
      }
      if (event.key === 'End') {
        move(conversations.length - 1);
        return;
      }
      if (focusedThreadId === null) {
        return;
      }
      if (event.key === ' ') {
        const focused = conversations[index];
        if (focused?.presentation.isSelectable === true) {
          event.preventDefault();
          onToggleCheck(focusedThreadId);
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        onOpen(focusedThreadId);
      }
    },
    [conversations, focusedThreadId, onFocus, onOpen, onToggleCheck],
  );
  return { onKeyDown };
};
