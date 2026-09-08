import { Button, Chip, SelectableRow, tintClasses } from '@goodboy/ui';
import { RESOLVE_QUEUE_STATUS_LABEL, acceptFixLabel, coversSeveralSentence } from '../../resolveQueueCopy';
import type { ResolveQueueRow as QueueRow } from '../../buildResolveQueueRows';
import { BADGE_TONE_BY_STATUS } from './statusTone';

type Props = {
  readonly row: QueueRow;
  readonly isAcceptEligible: boolean;
  readonly acceptSummary: string | null;
  readonly onOpen: () => void;
  readonly onAcceptFix: () => void;
};

export const ResolveQueueRow = ({
  row,
  isAcceptEligible,
  acceptSummary,
  onOpen,
  onAcceptFix,
}: Props) => {
  const { status, reviewerNote, proposal, coveredThreadIds } = row;
  const tone = BADGE_TONE_BY_STATUS[status];
  const coveredCount = coveredThreadIds.length + 1;
  const coversSeveral = coversSeveralSentence({ coveredCount });
  return (
    <li className="list-none">
      <SelectableRow
        id={`resolve-queue-row-${row.thread.threadId}`}
        selected={false}
        onClick={onOpen}
        title={reviewerNote?.body ?? 'No reviewer comment'}
        className="flex min-w-0 flex-col gap-1 px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {reviewerNote?.body ?? 'No reviewer comment on this thread'}
          </span>
          <Chip size="3xs" bordered={false} tone={tone} label={RESOLVE_QUEUE_STATUS_LABEL[status]} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          {reviewerNote?.author != null && <span className="truncate">{reviewerNote.author}</span>}
          {reviewerNote?.location != null && (
            <>
              <span aria-hidden className="opacity-50">
                ·
              </span>
              <span className="truncate font-mono">{reviewerNote.location}</span>
            </>
          )}
        </div>
        {proposal != null && proposal.trim() !== '' && (
          <p className="min-w-0 truncate text-2xs text-muted-foreground/80">{proposal}</p>
        )}
        {coversSeveral != null && (
          <p className="min-w-0 truncate text-2xs text-muted-foreground/70">{coversSeveral}</p>
        )}
      </SelectableRow>
      {isAcceptEligible && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <Button
            size="sm"
            variant="success"
            onClick={(event) => {
              event.stopPropagation();
              onAcceptFix();
            }}
          >
            {acceptFixLabel({ coveredCount })}
          </Button>
          {acceptSummary != null && (
            <span className={`truncate text-2xs ${tintClasses('success').text}`}>{acceptSummary}</span>
          )}
        </div>
      )}
    </li>
  );
};
