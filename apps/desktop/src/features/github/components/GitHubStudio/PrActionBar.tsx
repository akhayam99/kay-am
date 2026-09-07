import { useState } from 'react';
import type { PullRequestState } from '@goodboy/types';
import { Button, cn, Divider, InlineConfirm } from '@goodboy/ui';
import { GitMerge, GitPullRequestDraft, Plus, RotateCcw, Send, XCircle } from 'lucide-react';
import { PrVerdictAction, type PrVerdictSubmission } from './PrVerdictAction';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

export type ActionBusy = 'ready' | 'undraft' | 'merge' | 'close' | 'reopen' | 'review' | null;

type Props = {
  readonly pr: PullRequestState;
  readonly busy: ActionBusy;
  readonly canMerge: boolean;
  readonly canReview: boolean;
  readonly mergeReason: string;
  readonly onSubmitVerdict: (submission: PrVerdictSubmission) => void;
  readonly onMarkReady: () => void;
  readonly onConvertDraft: () => void;
  readonly onClose: () => void;
  readonly onReopen: () => void;
  readonly canCreateNew: boolean;
  readonly onCreateNew: () => void;
  readonly onMerge: () => Promise<void>;
};

export const PrActionBar = ({
  pr,
  busy,
  canMerge,
  canReview,
  mergeReason,
  onSubmitVerdict,
  onMarkReady,
  onConvertDraft,
  onClose,
  onReopen,
  canCreateNew,
  onCreateNew,
  onMerge,
}: Props) => {
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  const isTerminal = pr.state === 'merged' || pr.state === 'closed';
  const isClosed = pr.state === 'closed';
  const isQueued = pr.state === 'queued';
  const isDraft = pr.isDraft;
  const spin = (k: ActionBusy) => busy === k;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!isTerminal && isQueued && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          <GitMerge size={ICON_SIZE.row} aria-hidden />
          {pr.mergeQueue != null ? 'In merge queue' : 'Auto-merge on'}
          {pr.mergeQueue?.position != null && <span>#{pr.mergeQueue.position}</span>}
        </span>
      )}

      {!isTerminal &&
        !isQueued &&
        (isMergeConfirmOpen ? (
          <InlineConfirm
            role="danger"
            icon={<GitMerge size={ICON_SIZE.row} aria-hidden />}
            title="Squash merge this pull request?"
            description="This action cannot be undone."
            confirmLabel={spin('merge') ? 'Merging' : 'Confirm merge'}
            onConfirm={async () => {
              await onMerge();
              setIsMergeConfirmOpen(false);
            }}
            onCancel={() => setIsMergeConfirmOpen(false)}
            isBusy={spin('merge')}
            isConfirmDisabled={canMerge === false || busy !== null}
            className="w-64"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsMergeConfirmOpen(true)}
            disabled={canMerge === false || busy !== null}
            title={mergeReason}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              canMerge
                ? 'border-success bg-success text-success-foreground hover:bg-success/90'
                : 'border-border-soft text-muted-foreground',
            )}
          >
            <GitMerge size={ICON_SIZE.row} aria-hidden />
            Merge
          </button>
        ))}

      {!isTerminal && (
        <PrVerdictAction
          canReview={canReview}
          isBusy={busy !== null}
          isSubmitting={spin('review')}
          onSubmit={onSubmitVerdict}
        />
      )}

      {!isTerminal && <Divider orientation="vertical" className="mx-0.5 h-5" />}

      {!isTerminal && isDraft ? (
        <Button
          variant="success"
          emphasis="outline"
          size="sm"
          onClick={onMarkReady}
          disabled={busy !== null}
          isBusy={spin('ready')}
        >
          <Send size={ICON_SIZE.row} aria-hidden />
          Mark ready
        </Button>
      ) : !isTerminal ? (
        <Button
          variant="warning"
          emphasis="outline"
          size="sm"
          onClick={onConvertDraft}
          disabled={busy !== null}
          isBusy={spin('undraft')}
        >
          <GitPullRequestDraft size={ICON_SIZE.row} aria-hidden />
          Convert to draft
        </Button>
      ) : null}

      {!isTerminal && (
        <Button
          variant="danger"
          emphasis="outline"
          size="sm"
          onClick={onClose}
          disabled={busy !== null}
          isBusy={spin('close')}
        >
          <XCircle size={ICON_SIZE.row} aria-hidden />
          Close
        </Button>
      )}

      {isClosed ? (
        <>
          <Button
            variant="success"
            emphasis="outline"
            size="sm"
            onClick={onReopen}
            disabled={busy !== null}
            isBusy={spin('reopen')}
          >
            <RotateCcw size={ICON_SIZE.row} aria-hidden />
            Reopen
          </Button>
          <Button
            variant="primary"
            emphasis="outline"
            size="sm"
            onClick={onCreateNew}
            disabled={canCreateNew === false}
            title={
              canCreateNew
                ? 'Open a new pull request for this branch'
                : 'An agent is already opening a pull request for this session'
            }
          >
            <Plus size={ICON_SIZE.row} aria-hidden />
            Create new PR
          </Button>
        </>
      ) : null}
    </div>
  );
};
