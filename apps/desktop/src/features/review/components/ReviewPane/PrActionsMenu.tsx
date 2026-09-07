import { useState } from 'react';
import {
  ChevronDown,
  GitMerge,
  GitPullRequestDraft,
  Plus,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { InlineConfirm, OverflowMenu, type OverflowMenuItem } from '@goodboy/ui';
import type { PullRequestState } from '@goodboy/types';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';
import type { ActionBusy } from '../../../github/components/GitHubStudio/PrActionBar';

type Props = {
  readonly pr: PullRequestState;
  readonly busy: ActionBusy;
  readonly canMerge: boolean;
  readonly mergeReason: string;
  readonly canCreateNew: boolean;
  readonly onMarkReady: () => void;
  readonly onConvertDraft: () => void;
  readonly onClosePr: () => void;
  readonly onReopen: () => void;
  readonly onMerge: () => Promise<void>;
  readonly onCreateNew: () => void;
};

export const PrActionsMenu = ({
  pr,
  busy,
  canMerge,
  mergeReason,
  canCreateNew,
  onMarkReady,
  onConvertDraft,
  onClosePr,
  onReopen,
  onMerge,
  onCreateNew,
}: Props) => {
  const [isMergeConfirmOpen, setIsMergeConfirmOpen] = useState(false);
  const isTerminal = pr.state === 'merged' || pr.state === 'closed';
  const isClosed = pr.state === 'closed';
  const isQueued = pr.state === 'queued';
  const isBusy = busy !== null;

  if (isMergeConfirmOpen) {
    return (
      <InlineConfirm
        role="danger"
        icon={<GitMerge size={ICON_SIZE.row} aria-hidden />}
        title="Squash merge this pull request?"
        description="This action cannot be undone."
        confirmLabel={busy === 'merge' ? 'Merging' : 'Confirm merge'}
        onConfirm={async () => {
          await onMerge();
          setIsMergeConfirmOpen(false);
        }}
        onCancel={() => setIsMergeConfirmOpen(false)}
        isBusy={busy === 'merge'}
        isConfirmDisabled={canMerge === false || isBusy}
        className="w-64"
      />
    );
  }

  const items: Array<OverflowMenuItem> = [];
  if (!isTerminal && !isQueued) {
    items.push({
      kind: 'item',
      key: 'merge',
      label: 'Merge',
      icon: GitMerge,
      disabled: canMerge === false || isBusy,
      hint: mergeReason,
      onClick: () => setIsMergeConfirmOpen(true),
    });
  }
  if (!isTerminal && pr.isDraft) {
    items.push({
      kind: 'item',
      key: 'ready',
      label: 'Mark ready',
      icon: Send,
      disabled: isBusy,
      onClick: onMarkReady,
    });
  }
  if (!isTerminal && !pr.isDraft) {
    items.push({
      kind: 'item',
      key: 'draft',
      label: 'Convert to draft',
      icon: GitPullRequestDraft,
      disabled: isBusy,
      onClick: onConvertDraft,
    });
  }
  if (!isTerminal) {
    items.push({
      kind: 'item',
      key: 'close',
      label: 'Close',
      icon: XCircle,
      destructive: true,
      disabled: isBusy,
      onClick: onClosePr,
    });
  }
  if (isClosed) {
    items.push({
      kind: 'item',
      key: 'reopen',
      label: 'Reopen',
      icon: RotateCcw,
      disabled: isBusy,
      onClick: onReopen,
    });
  }
  items.push({
    kind: 'item',
    key: 'create',
    label: 'Create new PR',
    icon: Plus,
    disabled: canCreateNew === false || isBusy,
    hint: canCreateNew
      ? 'Open a new pull request for this branch'
      : 'An agent is already opening a pull request for this session',
    onClick: onCreateNew,
  });

  return (
    <OverflowMenu
      items={items}
      label="PR actions"
      tooltip="Pull request actions"
      trigger={
        <span className="inline-flex items-center gap-1 text-2xs font-medium">
          PR actions
          <ChevronDown size={ICON_SIZE.row} aria-hidden className="shrink-0 opacity-70" />
        </span>
      }
      triggerClassName="px-1.5"
    />
  );
};
