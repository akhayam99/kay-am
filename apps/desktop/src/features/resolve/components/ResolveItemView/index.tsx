import {
  Button,
  Chip,
  Divider,
  Markdown,
  OverflowMenu,
  PANE_RHYTHM,
  ScrollFade,
  SectionHeader,
  Tooltip,
  cn,
} from '@goodboy/ui';
import type { OverflowMenuItem } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import type { ResolveChecksSummary } from '../../checkReceipts';
import type { ResolveProposalKind, ResolveQueueRow } from '../../buildResolveQueueRows';
import { EMPTY_REFUSAL_REPLY } from '../../../../store/slices/resolve/refuseResolveQueueItem';
import { RESOLVE_ITEM_LABEL, runNote } from '../../resolveItemCopy';
import {
  RESOLVE_COMMENT_UNAVAILABLE,
  RESOLVE_QUEUE_ACTION_LABEL,
  RESOLVE_QUEUE_STATUS_LABEL,
  sharedRunHeading,
} from '../../resolveQueueCopy';
import { deliverySupportLine } from '../../resolveDeliverySupport';
import { BADGE_TONE_BY_STATUS } from '../ResolveQueueHome/statusTone';
import { ChangeBlock } from './ChangeBlock';
import { ChecksBlock } from './ChecksBlock';
import type { ResolveDecisionMode } from '../../resolveItemDraft';
import { DecisionBlock } from './DecisionBlock';
import { ResolveCommitIdentity } from './ResolveCommitIdentity';
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
  readonly candidateSha: string | null;
  readonly reply: string;
  readonly instruction: string;
  readonly mode: ResolveDecisionMode;
  readonly proposalKind: ResolveProposalKind;
  readonly isBusy: boolean;
  readonly canApprove: boolean;
  readonly approveBlockedReason: string | null;
  readonly refuseBlockedReason: string | null;
  readonly canRunCheck: boolean;
  readonly isCheckRunning: boolean;
  readonly checksNote: string | null;
  readonly error: string | null;
  readonly onChangeReply: (value: string) => void;
  readonly onChangeInstruction: (value: string) => void;
  readonly onApprove: () => void;
  readonly onStartRevise: () => void;
  readonly onCancelRevise: () => void;
  readonly onStartRefuse: () => void;
  readonly onCancelRefuse: () => void;
  readonly onRefuse: () => void;
  readonly onSendToAgent: () => void;
  readonly onLater: () => void;
  readonly onReopen: () => void;
  readonly onOpenInDiff: () => void;
  readonly onOpenCommit: (params: { readonly sha: string }) => void;
  readonly onRunCheck: () => void;
  readonly onStopRun: () => void;
  readonly onViewWork: () => void;
  readonly onSelectRelated: (threadId: string) => void;
};

export const ResolveItemView = ({
  row,
  coveredRows,
  files,
  isDiffLoading,
  diffError,
  checks,
  costUsd,
  candidateSha,
  reply,
  instruction,
  mode,
  proposalKind,
  isBusy,
  canApprove,
  approveBlockedReason,
  refuseBlockedReason,
  canRunCheck,
  isCheckRunning,
  checksNote,
  error,
  onChangeReply,
  onChangeInstruction,
  onApprove,
  onStartRevise,
  onCancelRevise,
  onStartRefuse,
  onCancelRefuse,
  onRefuse,
  onSendToAgent,
  onLater,
  onReopen,
  onOpenInDiff,
  onOpenCommit,
  onRunCheck,
  onStopRun,
  onViewWork,
  onSelectRelated,
}: Props) => {
  const note = runNote({ stateReason: row.thread.stateReason });
  const isDelivered = row.status === 'pushed' || row.status === 'wont_fix_sent';
  const isReplyBlank = reply.trim() === '';
  const question = row.thread.question;
  const isAnswering = row.status === 'agent_asked';
  const fieldId = `resolve-item-${row.thread.threadId}`;
  const reviseItems: ReadonlyArray<OverflowMenuItem> = isAnswering
    ? []
    : [
        {
          kind: 'item',
          key: 'revise',
          label: RESOLVE_QUEUE_ACTION_LABEL.askForChanges,
          disabled: isBusy,
          onClick: onStartRevise,
        },
      ];
  const menuItems: ReadonlyArray<OverflowMenuItem> = isDelivered
    ? [
        {
          kind: 'item',
          key: 'reopen',
          label: RESOLVE_ITEM_LABEL.reopen,
          disabled: isBusy,
          onClick: onReopen,
        },
      ]
    : [
        ...reviseItems,
        {
          kind: 'item',
          key: 'wont-fix',
          label: RESOLVE_QUEUE_ACTION_LABEL.wontFix,
          disabled: isBusy || refuseBlockedReason !== null,
          hint: refuseBlockedReason ?? undefined,
          onClick: onStartRefuse,
        },
        {
          kind: 'item',
          key: 'later',
          label: RESOLVE_QUEUE_ACTION_LABEL.later,
          disabled: isBusy,
          onClick: onLater,
        },
      ];

  return (
    <div
      data-testid={fieldId}
      className="flex h-full min-h-0 min-w-0 flex-col bg-elevated text-foreground"
    >
      <div className="flex min-w-0 shrink-0 items-center gap-4 px-3 py-2">
        <h2 className="shrink-0 text-sm font-medium leading-5">{RESOLVE_ITEM_LABEL.comment}</h2>
        <Chip
          size="xs"
          bordered={false}
          tone={BADGE_TONE_BY_STATUS[row.status]}
          label={RESOLVE_QUEUE_STATUS_LABEL[row.status]}
        />
        <span className="flex flex-1 items-center justify-end gap-2">
          {mode === 'reply' && !isDelivered && isAnswering && (
            <Button size="sm" variant="primary" disabled={isBusy} onClick={onStartRevise}>
              {RESOLVE_QUEUE_ACTION_LABEL.answerAgent}
            </Button>
          )}
          {mode === 'reply' && !isDelivered && !isAnswering && (
            <Tooltip content={approveBlockedReason ?? RESOLVE_QUEUE_ACTION_LABEL.approveFix}>
              <Button
                size="sm"
                variant="primary"
                disabled={isBusy || !canApprove}
                onClick={onApprove}
              >
                {RESOLVE_QUEUE_ACTION_LABEL.approveFix}
              </Button>
            </Tooltip>
          )}
          <OverflowMenu items={menuItems} label="Comment actions" align="right" />
        </span>
      </div>
      <Divider />
      <ScrollFade className="min-h-0 flex-1" viewportClassName="p-3" fadeFrom="elevated">
        <div className={cn(PANE_RHYTHM.stack, 'min-w-0')}>
          <ReviewerCommentBlock note={row.reviewerNote} />
          {question != null && question !== '' && (
            <div className="flex min-w-0 flex-col gap-2">
              <SectionHeader label={RESOLVE_ITEM_LABEL.agentQuestion} headingLevel={3} />
              <Markdown
                text={question}
                variant="preview"
                className="max-w-[65ch] text-sm text-foreground"
              />
            </div>
          )}
          <DecisionBlock
            fieldId={fieldId}
            reply={reply}
            instruction={instruction}
            mode={mode}
            proposalKind={proposalKind}
            isAnswering={isAnswering}
            isDelivered={isDelivered}
            deliveredReply={row.delivery?.replyBody ?? null}
            deliverySupport={deliverySupportLine({ row })}
            isBusy={isBusy}
            onChangeReply={onChangeReply}
            onChangeInstruction={onChangeInstruction}
          />
          <ResolveCommitIdentity
            integratedSha={row.item.integratedSha}
            candidateSha={candidateSha}
            recordedShas={row.thread.commitShas ?? []}
            onOpenCommit={onOpenCommit}
          />
          {note !== null && <p className="text-2xs text-warning">{note}</p>}
          {error !== null && <p className="text-2xs text-danger">{error}</p>}
          <ChecksBlock
            checks={checks}
            canRunCheck={canRunCheck}
            isRunning={isCheckRunning}
            note={checksNote}
            onRunCheck={onRunCheck}
          />
          <ChangeBlock
            files={files}
            isLoading={isDiffLoading}
            error={diffError}
            onOpenInDiff={onOpenInDiff}
          />
          {coveredRows.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2">
              <SectionHeader
                label={RESOLVE_ITEM_LABEL.relatedComments}
                headingLevel={3}
                hint={sharedRunHeading({ count: coveredRows.length + 1 })}
              />
              <ul className="flex min-w-0 flex-col gap-2">
                {coveredRows.map((covered) => (
                  <li key={covered.thread.threadId} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectRelated(covered.thread.threadId)}
                      className="block w-full truncate rounded text-left text-xs leading-4 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                    >
                      {covered.reviewerNote?.body ?? RESOLVE_COMMENT_UNAVAILABLE}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.attempt !== null && (
            <RunCard
              attempt={row.attempt}
              costUsd={costUsd}
              onStop={onStopRun}
              onViewWork={onViewWork}
            />
          )}
        </div>
      </ScrollFade>
      {mode === 'refuse' && (
        <>
          <Divider />
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
            <p className="min-w-0 text-2xs text-warning">
              {isReplyBlank ? EMPTY_REFUSAL_REPLY : ''}
            </p>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" disabled={isBusy} onClick={onCancelRefuse}>
                {RESOLVE_QUEUE_ACTION_LABEL.cancel}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={isBusy || isReplyBlank}
                onClick={onRefuse}
              >
                {RESOLVE_QUEUE_ACTION_LABEL.wontFix}
              </Button>
            </div>
          </div>
        </>
      )}
      {mode === 'revise' && (
        <>
          <Divider />
          <div className="flex shrink-0 items-center justify-end gap-2 px-3 py-2">
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={onCancelRevise}>
              {RESOLVE_QUEUE_ACTION_LABEL.cancel}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={isBusy || instruction.trim() === ''}
              onClick={onSendToAgent}
            >
              {RESOLVE_QUEUE_ACTION_LABEL.send}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
