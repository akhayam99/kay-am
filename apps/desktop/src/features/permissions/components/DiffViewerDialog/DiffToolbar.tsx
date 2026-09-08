import { Check, GitBranch, RefreshCw, X } from 'lucide-react';
import { Chip, cn, Divider, Tooltip } from '@goodboy/ui';
import type { WorktreeStatus } from '@goodboy/types';
import { distanceAhead, distanceBehind } from '../../../../shared/lib/gitStatus';
import { TOOLBAR_ICON_BTN } from './lib';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  title?: string;
  prNumber?: number;
  openCommentsCount: number;
  reviewedCount: number | null;
  filesCount: number;
  status: WorktreeStatus | null;
  onRefresh?: () => void;
  refreshing: boolean;
  showClose: boolean;
  onClose: () => void;
  viewSelector?: React.ReactNode;
  layoutToggle?: React.ReactNode;
  resolveAction?: React.ReactNode;
  presentation?: 'bar' | 'actions';
};

export const DiffToolbar = ({
  title,
  prNumber,
  openCommentsCount,
  reviewedCount,
  filesCount,
  status,
  onRefresh,
  refreshing,
  showClose,
  onClose,
  viewSelector,
  layoutToggle,
  resolveAction,
  presentation = 'bar',
}: Props) => {
  const titleText = title ?? (prNumber !== undefined ? `PR #${prNumber} diff` : 'Diff');
  const distance = status?.upstreamDistance ?? null;
  const ahead = distance != null ? (distanceAhead({ distance }) ?? 0) : 0;
  const behind = distance != null ? (distanceBehind({ distance }) ?? 0) : 0;
  const hasAheadBehind = status?.upstream != null && (ahead > 0 || behind > 0);
  return (
    <>
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          presentation === 'bar' ? 'shrink-0 px-2.5 py-1.5' : 'flex-wrap justify-end',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {viewSelector ??
            (presentation === 'bar' ? (
              <span className="shrink-0 text-xs font-semibold tracking-tight text-foreground">
                {titleText}
              </span>
            ) : null)}
          {openCommentsCount > 0 ? (
            <Chip
              tone="warning"
              size="3xs"
              bordered={false}
              label={`${openCommentsCount} ${openCommentsCount === 1 ? 'note' : 'notes'}`}
              title={`${openCommentsCount} open ${openCommentsCount === 1 ? 'note' : 'notes'}`}
              className="shrink-0"
            />
          ) : null}
          {reviewedCount !== null && filesCount > 0 ? (
            <Chip
              tone={reviewedCount === filesCount ? 'success' : 'neutral'}
              size="3xs"
              bordered={false}
              icon={<Check size={9} aria-hidden />}
              label={`${reviewedCount}/${filesCount} reviewed`}
              title={`${reviewedCount} of ${filesCount} files reviewed`}
              className="shrink-0"
            />
          ) : null}
        </div>

        {status?.branch ? (
          <span className="hidden min-w-0 shrink items-center gap-1.5 text-2xs text-muted-foreground xl:flex">
            <GitBranch size={11} aria-hidden className="shrink-0 text-muted-foreground/70" />
            <span className="truncate font-mono">{status.branch}</span>
            {hasAheadBehind ? (
              <span className="flex shrink-0 items-center gap-1 tabular-nums">
                {ahead > 0 ? <span title="Unpushed commits">↑{ahead}</span> : null}
                {behind > 0 ? <span title="Behind upstream">↓{behind}</span> : null}
              </span>
            ) : null}
          </span>
        ) : null}

        {layoutToggle}
        {resolveAction}

        <div className="flex shrink-0 items-center gap-0.5">
          {onRefresh ? (
            <Tooltip content="Refresh git state">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh git state"
                className={cn(TOOLBAR_ICON_BTN, 'disabled:opacity-50')}
              >
                <RefreshCw size={ICON_SIZE.row} aria-hidden />
              </button>
            </Tooltip>
          ) : null}
          {showClose ? (
            <Tooltip content="Close">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={TOOLBAR_ICON_BTN}
              >
                <X size={ICON_SIZE.row} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {presentation === 'bar' ? <Divider className="shrink-0" /> : null}
    </>
  );
};
