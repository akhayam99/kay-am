import { FileText, ListChecks, MessageSquare, PencilLine } from 'lucide-react';
import { Button, GhostActionButton, PANE_RHYTHM, cn } from '@goodboy/ui';
import type { ResolvePublicationPreview } from '@goodboy/types';
import type { ReviewMode } from '../../../reviewMode';
import { PublicationPreview, type PreviewBlockerAction } from './PublicationPreview';
import { PublicationProgress } from './PublicationProgress';

export type PublishScope = 'selected' | 'all';

type Props = {
  readonly readyCount: number;
  readonly selectedCount: number;
  readonly selectedReadyCount: number;
  readonly draftCount: number;
  readonly mode: ReviewMode;
  readonly preview: ResolvePublicationPreview | null;
  readonly titleByThreadId: ReadonlyMap<string, string>;
  readonly staleNote: string | null;
  readonly progress: { readonly sentence: string; readonly elapsed: string | null } | null;
  readonly isBusy: boolean;
  readonly onPublish: (scope: PublishScope) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onViewChanges: () => void;
  readonly onBlockerAction: (action: PreviewBlockerAction) => void;
  readonly onSelectMode: (mode: ReviewMode) => void;
};

export const PublishConversationsBar = ({
  readyCount,
  selectedCount,
  selectedReadyCount,
  draftCount,
  mode,
  preview,
  titleByThreadId,
  staleNote,
  progress,
  isBusy,
  onPublish,
  onConfirm,
  onCancel,
  onViewChanges,
  onBlockerAction,
  onSelectMode,
}: Props) => (
  <div
    className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', PANE_RHYTHM.dock)}
  >
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      {preview !== null ? (
        <PublicationPreview
          preview={preview}
          titleByThreadId={titleByThreadId}
          staleNote={staleNote}
          isBusy={isBusy}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onViewChanges={onViewChanges}
          onBlockerAction={onBlockerAction}
        />
      ) : progress !== null ? (
        <PublicationProgress sentence={progress.sentence} elapsed={progress.elapsed} />
      ) : (
        <>
          <span className="text-2xs tabular-nums text-muted-foreground">
            {readyCount > 0 && `${readyCount} ready`}
            {readyCount > 0 && selectedCount > 0 && ' · '}
            {selectedCount > 0 && `${selectedCount} selected`}
          </span>
          {selectedReadyCount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onPublish('selected')}>
              {`Publish selected (${selectedReadyCount})`}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={readyCount === 0}
            {...(readyCount === 0 && { title: 'Nothing ready to publish' })}
            onClick={() => onPublish('all')}
          >
            {`Publish all (${readyCount})`}
          </Button>
        </>
      )}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <GhostActionButton
        icon={PencilLine}
        label={draftCount > 0 ? `Write review (${draftCount})` : 'Write review'}
        pressed={mode === 'write_review'}
        onClick={() => onSelectMode(mode === 'write_review' ? 'queue' : 'write_review')}
      />
      <GhostActionButton
        icon={FileText}
        label="PR details"
        pressed={mode === 'pr_details' || mode === 'create_pr'}
        onClick={() => onSelectMode(mode === 'pr_details' ? 'queue' : 'pr_details')}
      />
      <GhostActionButton
        icon={MessageSquare}
        label="PR activity"
        pressed={mode === 'pr_activity'}
        onClick={() => onSelectMode(mode === 'pr_activity' ? 'queue' : 'pr_activity')}
      />
      <GhostActionButton
        icon={ListChecks}
        label="Checks"
        pressed={mode === 'checks'}
        onClick={() => onSelectMode(mode === 'checks' ? 'queue' : 'checks')}
      />
    </div>
  </div>
);
