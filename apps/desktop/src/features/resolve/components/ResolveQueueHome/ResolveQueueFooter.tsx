import { useState } from 'react';
import { Button, Collapsible } from '@goodboy/ui';
import { RESOLVE_QUEUE_ACTION_LABEL, RESOLVE_QUEUE_STATUS_LABEL } from '../../resolveQueueCopy';
import type { ResolveQueueRow } from '../../buildResolveQueueRows';

type Props = {
  readonly pushed: ReadonlyArray<ResolveQueueRow>;
  readonly later: ReadonlyArray<ResolveQueueRow>;
  readonly onOpen: (params: { readonly threadId: string }) => void;
  readonly onTakeUp: (params: { readonly threadId: string; readonly itemId: string }) => void;
};

export const ResolveQueueFooter = ({ pushed, later, onOpen, onTakeUp }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  if (pushed.length === 0 && later.length === 0) {
    return null;
  }
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={`${RESOLVE_QUEUE_STATUS_LABEL.pushed} (${pushed.length}) · ${RESOLVE_QUEUE_STATUS_LABEL.later} (${later.length})`}
      className="mt-2 border-t border-border-soft pt-2"
    >
      <div className="flex flex-col gap-3">
        {later.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {RESOLVE_QUEUE_STATUS_LABEL.later}
            </p>
            <ul className="flex flex-col gap-1">
              {later.map((row) => (
                <li key={row.thread.threadId} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen({ threadId: row.thread.threadId })}
                    className="min-w-0 flex-1 truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {row.reviewerNote?.body ?? row.thread.threadId}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onTakeUp({ threadId: row.thread.threadId, itemId: row.item.id })}
                  >
                    {RESOLVE_QUEUE_ACTION_LABEL.takeUp}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pushed.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {RESOLVE_QUEUE_STATUS_LABEL.pushed}
            </p>
            <ul className="flex flex-col gap-1">
              {pushed.map((row) => (
                <li key={row.thread.threadId}>
                  <button
                    type="button"
                    onClick={() => onOpen({ threadId: row.thread.threadId })}
                    className="min-w-0 truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {row.reviewerNote?.body ?? row.thread.threadId}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Collapsible>
  );
};
