import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Chip, Divider, GhostActionButton } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import type { ResolveChecksSummary } from '../../checkReceipts';
import type { ResolveQueueRow } from '../../buildResolveQueueRows';
import { RESOLVE_ITEM_LABEL, runNote } from '../../resolveItemCopy';
import { RESOLVE_QUEUE_STATUS_LABEL } from '../../resolveQueueCopy';
import { BADGE_TONE_BY_STATUS } from '../ResolveQueueHome/statusTone';
import { ChangeBlock } from './ChangeBlock';
import { ChecksBlock } from './ChecksBlock';
import { DecisionBlock } from './DecisionBlock';
import { ProposalBlock } from './ProposalBlock';
import { ReviewerCommentBlock } from './ReviewerCommentBlock';
import { RunCard } from './RunCard';

type Props = {
  readonly row: ResolveQueueRow;
  readonly coveredRows: ReadonlyArray<ResolveQueueRow>;
  readonly files: ReadonlyArray<FileDiff>;
  readonly isDiffLoading: boolean;
  readonly diffError: string | null;
  readonly checks: ResolveChecksSummary;
  readonly costUsd: number | null;
  readonly reply: string;
  readonly instruction: string;
  readonly isBusy: boolean;
  readonly canAccept: boolean;
  readonly canRunCheck: boolean;
  readonly isCheckRunning: boolean;
  readonly checksNote: string | null;
  readonly error: string | null;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly onChangeReply: (value: string) => void;
  readonly onChangeInstruction: (value: string) => void;
  readonly onAccept: () => void;
  readonly onAskForChanges: () => void;
  readonly onLater: () => void;
  readonly onOpenInDiff: () => void;
  readonly onRunCheck: () => void;
  readonly onStopRun: () => void;
  readonly onViewWork: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onCollapse: () => void;
};

export const ResolveItemView = ({
  row,
  coveredRows,
  files,
  isDiffLoading,
  diffError,
  checks,
  costUsd,
  reply,
  instruction,
  isBusy,
  canAccept,
  canRunCheck,
  isCheckRunning,
  checksNote,
  error,
  hasPrevious,
  hasNext,
  onChangeReply,
  onChangeInstruction,
  onAccept,
  onAskForChanges,
  onLater,
  onOpenInDiff,
  onRunCheck,
  onStopRun,
  onViewWork,
  onPrevious,
  onNext,
  onCollapse,
}: Props) => {
  const note = runNote({ stateReason: row.thread.stateReason });
  return (
    <div
      data-testid={`resolve-item-${row.thread.threadId}`}
      className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-elevated px-3 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Chip
          size="3xs"
          bordered={false}
          tone={BADGE_TONE_BY_STATUS[row.status]}
          label={RESOLVE_QUEUE_STATUS_LABEL[row.status]}
        />
        <span className="flex-1" />
        <GhostActionButton
          icon={ChevronLeft}
          label="Previous comment"
          disabled={!hasPrevious}
          onClick={onPrevious}
        />
        <GhostActionButton
          icon={ChevronRight}
          label="Next comment"
          disabled={!hasNext}
          onClick={onNext}
        />
        <Button size="sm" variant="ghost" onClick={onCollapse}>
          Close
        </Button>
      </div>
      <ReviewerCommentBlock
        note={row.reviewerNote}
        label={RESOLVE_ITEM_LABEL.reviewerSaid}
        isLead
      />
      {coveredRows.map((covered) => (
        <ReviewerCommentBlock
          key={covered.thread.threadId}
          note={covered.reviewerNote}
          label={RESOLVE_ITEM_LABEL.alsoCovered}
          isLead={false}
        />
      ))}
      <ProposalBlock proposal={row.proposal} />
      {note !== null && <p className="text-2xs text-warning">{note}</p>}
      <Divider />
      <ChangeBlock
        files={files}
        isLoading={isDiffLoading}
        error={diffError}
        onOpenInDiff={onOpenInDiff}
      />
      <Divider />
      <ChecksBlock
        checks={checks}
        canRunCheck={canRunCheck}
        isRunning={isCheckRunning}
        note={checksNote}
        onRunCheck={onRunCheck}
      />
      <Divider />
      <DecisionBlock
        coveredCount={coveredRows.length + 1}
        reply={reply}
        instruction={instruction}
        isBusy={isBusy}
        canAccept={canAccept}
        error={error}
        onChangeReply={onChangeReply}
        onChangeInstruction={onChangeInstruction}
        onAccept={onAccept}
        onAskForChanges={onAskForChanges}
        onLater={onLater}
      />
      {row.attempt !== null && (
        <RunCard
          attempt={row.attempt}
          costUsd={costUsd}
          onStop={onStopRun}
          onViewWork={onViewWork}
        />
      )}
    </div>
  );
};
