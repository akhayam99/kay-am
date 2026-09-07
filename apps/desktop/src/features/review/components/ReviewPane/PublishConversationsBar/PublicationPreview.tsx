import { useState } from 'react';
import { GitCommit, Upload } from 'lucide-react';
import { CountToggle, GhostActionButton, InlineConfirm, cn } from '@goodboy/ui';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import type { ResolvePublicationPreview } from '@goodboy/types';
import { blockerCopy, excludedSentence, previewSentence } from '../../../publicationCopy';

const INLINE_COMMIT_LIMIT = 6;

export type PreviewBlockerAction = 'open_diff' | 'view_work' | 'recheck_fix' | 'refresh';

type Props = {
  readonly preview: ResolvePublicationPreview;
  readonly titleByThreadId: ReadonlyMap<string, string>;
  readonly staleNote: string | null;
  readonly isBusy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onViewChanges: () => void;
  readonly onBlockerAction: (action: PreviewBlockerAction) => void;
};

const ACTION_LABEL: Record<PreviewBlockerAction, string> = {
  open_diff: 'Open diff',
  view_work: 'View work',
  recheck_fix: 'Recheck fix',
  refresh: 'Refresh',
};

export const PublicationPreview = ({
  preview,
  titleByThreadId,
  staleNote,
  isBusy,
  onConfirm,
  onCancel,
  onViewChanges,
  onBlockerAction,
}: Props) => {
  const [areCommitsShown, setAreCommitsShown] = useState(false);
  const blocker =
    preview.blocker === null
      ? null
      : blockerCopy({ blocker: preview.blocker, prNumber: preview.prNumber });
  const blockerAction = blocker?.action ?? null;
  const excluded = excludedSentence({ preview });
  const isListed = preview.commits.length <= INLINE_COMMIT_LIMIT || areCommitsShown;
  return (
    <InlineConfirm
      role="primary"
      icon={<Upload size={ICON_SIZE.control} aria-hidden />}
      title={previewSentence({ preview })}
      {...(staleNote !== null && { description: staleNote })}
      confirmLabel="Confirm publish"
      cancelLabel="Cancel"
      isBusy={isBusy}
      isConfirmDisabled={blocker !== null}
      altAction={{
        label: 'View changes',
        onClick: onViewChanges,
        icon: <GitCommit size={ICON_SIZE.row} aria-hidden />,
      }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      note={
        blocker !== null ? (
          <span className="flex items-center gap-2">
            <span className="text-2xs text-warning">{blocker.sentence}</span>
            {blockerAction !== null && (
              <GhostActionButton
                icon={GitCommit}
                label={ACTION_LABEL[blockerAction]}
                tone="warning"
                onClick={() => onBlockerAction(blockerAction)}
              />
            )}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        {preview.commits.length > INLINE_COMMIT_LIMIT && (
          <CountToggle
            label="commits"
            itemsLabel="commits"
            icon={GitCommit}
            count={preview.commits.length}
            isShown={areCommitsShown}
            onChange={setAreCommitsShown}
          />
        )}
        {isListed && preview.commits.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {preview.commits.map((commit) => (
              <li key={commit.sha} className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/80">
                  {commit.shortSha}
                </span>
                <span className="min-w-0 flex-1 truncate text-2xs text-foreground/80">
                  {commit.subject}
                </span>
                <span
                  className={cn(
                    'shrink-0 truncate font-mono text-3xs',
                    commit.threadIds.length === 0
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground',
                  )}
                >
                  {commit.threadIds.length === 0
                    ? 'not tied to a selected conversation'
                    : commit.threadIds
                        .map((threadId) => titleByThreadId.get(threadId) ?? 'conversation')
                        .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="font-mono text-3xs text-muted-foreground/70">
          {`local HEAD ${preview.localHead.slice(0, 7)} · remote ${preview.branch} at ${preview.remoteHead === null ? 'unknown' : preview.remoteHead.slice(0, 7)}`}
        </p>
        {excluded !== null && <p className="text-2xs text-muted-foreground">{excluded}</p>}
      </div>
    </InlineConfirm>
  );
};
