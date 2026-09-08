import { useState, type ReactNode } from 'react';
import {
  Button,
  Collapsible,
  ErrorStrip,
  Eyebrow,
  PANE_RHYTHM,
  ScrollFade,
  Skeleton,
  cn,
} from '@goodboy/ui';
import type { ConversationVerb } from '../../../conversationPresentation';
import type { Conversation, ConversationGroup as GroupModel } from '../../../selectConversations';
import { ConversationGroup } from './ConversationGroup';
import { ConversationRow } from './ConversationRow';
import { useConversationKeyboard } from './useConversationKeyboard';

type Props = {
  readonly listId: string;
  readonly groups: ReadonlyArray<GroupModel>;
  readonly ordered: ReadonlyArray<Conversation>;
  readonly activeCount: number;
  readonly openCount: number;
  readonly focusedThreadId: string | null;
  readonly selected: ReadonlySet<string>;
  readonly highlighted: ReadonlySet<string>;
  readonly titleByThreadId: ReadonlyMap<string, string>;
  readonly nowMs: number;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly isFixDisabled: boolean;
  readonly fixDisabledReason?: string;
  readonly emptyState?: ReactNode;
  readonly onRetryLoad: () => void;
  readonly onFocus: (threadId: string) => void;
  readonly onOpen: (threadId: string) => void;
  readonly onToggleCheck: (threadId: string) => void;
  readonly onAct: (params: { readonly threadId: string; readonly verb: ConversationVerb }) => void;
  readonly onFixAll: () => void;
  readonly onHoverSiblings: (threadIds: ReadonlyArray<string>) => void;
};

const rowIdFor = ({ listId, threadId }: { readonly listId: string; readonly threadId: string }) =>
  `${listId}-${threadId.replace(/[^\w-]/g, '')}`;

const ListSkeleton = () => (
  <div
    role="status"
    aria-label="Loading conversations"
    className={cn('flex flex-col gap-3', PANE_RHYTHM.rail.body)}
  >
    {[0, 1, 2].map((index) => (
      <div key={index} className="flex flex-col gap-1">
        <Skeleton className="h-3.5 w-40 rounded" />
        <Skeleton className="h-2.5 w-3/4 rounded" />
        <Skeleton className="h-2.5 w-1/2 rounded" />
      </div>
    ))}
  </div>
);

export const ConversationList = ({
  listId,
  groups,
  ordered,
  activeCount,
  openCount,
  focusedThreadId,
  selected,
  highlighted,
  titleByThreadId,
  nowMs,
  isLoading,
  error,
  isFixDisabled,
  fixDisabledReason,
  emptyState,
  onRetryLoad,
  onFocus,
  onOpen,
  onToggleCheck,
  onAct,
  onFixAll,
  onHoverSiblings,
}: Props) => {
  const [isResolvedOpen, setIsResolvedOpen] = useState(false);
  const { onKeyDown } = useConversationKeyboard({
    conversations: ordered,
    focusedThreadId,
    onFocus,
    onToggleCheck,
    onOpen,
  });
  const active = groups.filter((group) => group.key !== 'resolved');
  const resolved = groups.find((group) => group.key === 'resolved') ?? null;
  const renderRow = (conversation: Conversation) => (
    <ConversationRow
      key={conversation.threadId}
      conversation={conversation}
      rowId={rowIdFor({ listId, threadId: conversation.threadId })}
      siblingTitles={conversation.siblings.map(
        (threadId) => titleByThreadId.get(threadId) ?? 'conversation',
      )}
      isFocused={conversation.threadId === focusedThreadId}
      isChecked={selected.has(conversation.threadId)}
      isHighlighted={highlighted.has(conversation.threadId)}
      isDisabled={isFixDisabled && conversation.presentation.isFixable}
      {...(fixDisabledReason !== undefined && { disabledReason: fixDisabledReason })}
      nowMs={nowMs}
      onSelect={() => onOpen(conversation.threadId)}
      onToggleCheck={() => onToggleCheck(conversation.threadId)}
      onAct={(verb) => onAct({ threadId: conversation.threadId, verb })}
      onHoverSiblings={onHoverSiblings}
    />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex shrink-0 flex-col gap-2', PANE_RHYTHM.rail.header)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">Conversations</h3>
            {activeCount > 0 && (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {activeCount} active
              </span>
            )}
          </div>
          {openCount > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={isFixDisabled}
              {...(isFixDisabled &&
                fixDisabledReason !== undefined && { title: fixDisabledReason })}
              onClick={onFixAll}
            >
              {`Fix all (${openCount})`}
            </Button>
          )}
        </div>
        {error !== null && (
          <ErrorStrip label="the pull request" error={new Error(error)} onRetry={onRetryLoad} />
        )}
      </div>
      {isLoading && groups.length === 0 ? (
        <ListSkeleton />
      ) : groups.length === 0 ? (
        <div className={cn('flex min-h-0 flex-1 flex-col gap-4', PANE_RHYTHM.rail.body)}>
          {emptyState}
        </div>
      ) : (
        <ScrollFade className="min-h-0 flex-1">
          <div
            id={listId}
            role="listbox"
            tabIndex={0}
            aria-label="Review conversations"
            {...(focusedThreadId !== null && {
              'aria-activedescendant': rowIdFor({ listId, threadId: focusedThreadId }),
            })}
            onKeyDown={onKeyDown}
            className={cn('flex flex-col gap-4 focus-visible:outline-none', PANE_RHYTHM.rail.body)}
          >
            {active.map((group) => (
              <ConversationGroup
                key={group.key}
                label={group.label}
                count={group.conversations.length}
              >
                {group.conversations.map(renderRow)}
              </ConversationGroup>
            ))}
            {resolved !== null && (
              <Collapsible
                open={isResolvedOpen}
                onOpenChange={setIsResolvedOpen}
                trigger={<Eyebrow label={`Resolved ${resolved.conversations.length}`} muted />}
              >
                <ul role="presentation" className="flex flex-col gap-0.5 pt-1.5">
                  {resolved.conversations.map(renderRow)}
                </ul>
              </Collapsible>
            )}
          </div>
        </ScrollFade>
      )}
    </div>
  );
};
