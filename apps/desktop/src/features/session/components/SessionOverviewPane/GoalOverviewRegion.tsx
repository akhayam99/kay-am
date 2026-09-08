import { useEffect, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { History } from 'lucide-react';
import { Button, ClampedProse, SectionHeader, Skeleton, Textarea, Tooltip, cn } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { GoalAttachmentsStrip } from '../../../context/components/ContextPanel/strips/GoalAttachmentsStrip';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly value: string;
  readonly historyCount: number;
  readonly isLoading: boolean;
  readonly isSummarizing: boolean;
  readonly onOpenHistory: () => void;
};

type ClickParams = {
  readonly event: MouseEvent<HTMLElement>;
};

const isTextGesture = ({ event }: ClickParams): boolean => {
  if (event.target instanceof Element && event.target.closest('a, button') != null) {
    return true;
  }
  const selection = window.getSelection();
  return selection != null && selection.isCollapsed === false && selection.toString() !== '';
};

export const GoalOverviewRegion = ({
  sessionId,
  value,
  historyCount,
  isLoading,
  isSummarizing,
  onOpenHistory,
}: Props) => {
  const upsertSessionSlot = useAppStore((s) => s.upsertSessionSlot);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (isEditing) {
      return;
    }
    setDraft(value);
  }, [isEditing, value]);

  const commit = () => {
    setIsEditing(false);
    if (draft === value) {
      return;
    }
    void upsertSessionSlot(sessionId, 'goal', draft);
  };

  const startEditing = () => {
    if (isSummarizing) {
      return;
    }
    setIsEditing(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    startEditing();
  };

  const hasValue = value !== '';

  return (
    <section aria-label="Goal" className="flex min-w-0 flex-col gap-2">
      <SectionHeader
        label="Goal"
        className="px-0.5"
        action={
          historyCount > 0 ? (
            <Tooltip
              content={`${historyCount} previous ${historyCount === 1 ? 'version' : 'versions'}`}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenHistory}
                aria-label={`View ${historyCount} previous ${historyCount === 1 ? 'version' : 'versions'} of Goal`}
              >
                <History size={ICON_SIZE.row} aria-hidden />
                History
              </Button>
            </Tooltip>
          ) : null
        }
      />
      {isLoading ? (
        <div role="status" aria-label="Loading goal">
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : isEditing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(value);
              setIsEditing(false);
              return;
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commit();
            }
          }}
          aria-label="Goal"
          className="min-w-0 text-sm"
          autoGrow
          maxRows={12}
        />
      ) : (
        <div
          role="button"
          tabIndex={isSummarizing ? -1 : 0}
          onClick={(event) => {
            if (isTextGesture({ event })) {
              return;
            }
            startEditing();
          }}
          onKeyDown={onKeyDown}
          aria-label={hasValue ? 'Edit goal' : 'Add a goal'}
          className={cn(
            'min-w-0 max-w-full rounded-md motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-focus-ring)]',
            hasValue ? 'text-foreground' : 'cursor-text text-sm text-muted-foreground',
            isSummarizing ? 'cursor-default' : 'cursor-text hover:bg-foreground/[0.03]',
          )}
        >
          {hasValue ? (
            <ClampedProse text={value} lines={4} className="text-sm text-foreground" />
          ) : (
            'No goal yet'
          )}
        </div>
      )}
      <GoalAttachmentsStrip owner={{ type: 'session', id: sessionId }} />
    </section>
  );
};
