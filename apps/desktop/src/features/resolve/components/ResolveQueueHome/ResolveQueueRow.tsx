import type { KeyboardEvent, SyntheticEvent } from 'react';
import { CalendarClock, ChevronRight, RotateCcw } from 'lucide-react';
import { CardAction, CardActionSlot, Chip, ClampedProse, Tooltip, cn } from '@goodboy/ui';
import { formatAbsoluteDateTime, formatRelativeAge } from '../../../../shared/utils/relativeDate';
import { stripInlineMarkdown } from '../../../../shared/components/InlineMarkdown/stripInlineMarkdown';
import {
  RESOLVE_COMMENT_UNAVAILABLE,
  RESOLVE_QUEUE_ACTION_LABEL,
  RESOLVE_QUEUE_STATUS_LABEL,
} from '../../resolveQueueCopy';
import { deliverySupportLine } from '../../resolveDeliverySupport';
import { shortSha } from '../../resolveItemCopy';
import type { ResolveQueueRow as QueueRow } from '../../buildResolveQueueRows';
import { BADGE_TONE_BY_STATUS } from './statusTone';

type Props = {
  readonly row: QueueRow;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
  readonly onLater: () => void;
  readonly onResume: () => void;
  readonly onOpenCommit: (params: { readonly sha: string }) => void;
};

const REVEAL_GROUP =
  'group-hover/resolve-row:opacity-100 group-focus-within/resolve-row:opacity-100';

const deliveryTimeMs = ({ row }: { readonly row: QueueRow }): number | null =>
  row.delivery === null ? null : (row.delivery.replyPostedAt ?? row.delivery.resolvedAt);

const INNER_CONTROL_SELECTOR = 'a, button';

const stopOnInnerControl = (event: SyntheticEvent<HTMLElement>): void => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const control = target.closest(INNER_CONTROL_SELECTOR);
  if (control === null || !event.currentTarget.contains(control)) {
    return;
  }
  event.stopPropagation();
};

export const ResolveQueueRow = ({
  row,
  isSelected,
  onOpen,
  onLater,
  onResume,
  onOpenCommit,
}: Props) => {
  const { status, reviewerNote, item } = row;
  const body = reviewerNote?.body ?? null;
  const accessibleName =
    body === null ? RESOLVE_COMMENT_UNAVAILABLE : stripInlineMarkdown({ text: body });
  const support = deliverySupportLine({ row });
  const integratedSha = item.integratedSha;
  const postedAtMs = deliveryTimeMs({ row });
  const canDefer = item.approvalState === 'none' && status !== 'working';

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    onOpen();
  };

  return (
    <li className="list-none">
      <div
        role="button"
        tabIndex={0}
        aria-label={accessibleName}
        aria-current={isSelected ? 'true' : undefined}
        data-selected={isSelected}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className={cn(
          'group/resolve-row grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] grid-rows-[auto_auto] gap-x-4 gap-y-2 rounded-md px-3 py-2 text-left text-muted-foreground motion-safe:transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] data-[selected=true]:bg-muted data-[selected=true]:font-medium data-[selected=true]:text-foreground',
          status === 'working' && 'spin-border spin-border-info',
        )}
      >
        <div className="col-start-1 row-start-1 min-w-0">
          {body === null ? (
            <p className="text-sm font-medium leading-5 text-muted-foreground">
              {RESOLVE_COMMENT_UNAVAILABLE}
            </p>
          ) : (
            <div
              onClick={stopOnInnerControl}
              onKeyDown={stopOnInnerControl}
              className="min-w-0 text-sm font-medium leading-5 text-foreground"
            >
              <ClampedProse text={body} lines={2} className="text-foreground" />
            </div>
          )}
        </div>
        <div className="col-start-2 row-start-1 self-start">
          <Chip
            size="xs"
            width="lg"
            bordered={isSelected}
            tone={BADGE_TONE_BY_STATUS[status]}
            label={RESOLVE_QUEUE_STATUS_LABEL[status]}
          />
        </div>
        <CardActionSlot
          label={RESOLVE_QUEUE_ACTION_LABEL.openComment}
          className="col-start-3 row-start-1 self-start"
        >
          <CardAction
            icon={ChevronRight}
            label={RESOLVE_QUEUE_ACTION_LABEL.openComment}
            onClick={onOpen}
          />
        </CardActionSlot>
        <span className="col-start-1 row-start-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-3xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-2">
            {reviewerNote?.author != null && (
              <span className="shrink-0 truncate">{reviewerNote.author}</span>
            )}
            {reviewerNote?.location != null && (
              <span className="min-w-0 truncate font-mono">{reviewerNote.location}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {integratedSha !== null && (
              <Tooltip content={integratedSha} side="top">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenCommit({ sha: integratedSha });
                  }}
                  className="rounded font-mono tabular-nums underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                >
                  {shortSha({ sha: integratedSha })}
                </button>
              </Tooltip>
            )}
            {postedAtMs !== null && (
              <Tooltip
                content={formatAbsoluteDateTime({ iso: new Date(postedAtMs).toISOString() })}
                side="top"
              >
                <span className="tabular-nums">
                  {formatRelativeAge({ fromIso: new Date(postedAtMs).toISOString() })}
                </span>
              </Tooltip>
            )}
          </span>
        </span>
        <span className="col-start-2 row-start-2 self-start text-right text-2xs text-muted-foreground">
          {support}
        </span>
        <CardActionSlot
          label="Comment lifecycle actions"
          className="col-start-3 row-start-2 self-end"
        >
          {status === 'later' && (
            <CardAction
              icon={RotateCcw}
              label={RESOLVE_QUEUE_ACTION_LABEL.resume}
              onClick={onResume}
            />
          )}
          {status !== 'later' && canDefer && (
            <CardAction
              icon={CalendarClock}
              label={RESOLVE_QUEUE_ACTION_LABEL.later}
              reveal
              revealGroup={REVEAL_GROUP}
              onClick={onLater}
            />
          )}
        </CardActionSlot>
      </div>
    </li>
  );
};
