import { FileText, ListChecks, MessageSquare, PencilLine } from 'lucide-react';
import { GhostActionButton, PANE_RHYTHM, cn } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { ResolvePublishStrip } from '../../../../resolve/components/ResolvePublishStrip';
import type { ReviewMode } from '../../../reviewMode';

type Props = {
  readonly sessionId: SessionId;
  readonly draftCount: number;
  readonly mode: ReviewMode;
  readonly onSelectMode: (mode: ReviewMode) => void;
};

export const PublishConversationsBar = ({ sessionId, draftCount, mode, onSelectMode }: Props) => (
  <div
    className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', PANE_RHYTHM.dock)}
  >
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <ResolvePublishStrip sessionId={sessionId} />
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
