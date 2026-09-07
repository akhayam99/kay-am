import { useMemo } from 'react';
import type { DiffComment, PrComment, PullRequestState } from '@goodboy/types';
import { PrConversation } from '../../../../github/components/GitHubStudio/PrConversation';
import type { CommentThread } from '../../../../github/comment-threads';
import { LocalNotesSection } from '../LocalNotesSection';
import { ModeShell } from './ModeShell';

type Props = {
  readonly pr: PullRequestState;
  readonly comments: ReadonlyArray<PrComment>;
  readonly localNotes: ReadonlyArray<DiffComment>;
  readonly onBack: (() => void) | null;
  readonly onOpenUrl: (url: string) => void;
  readonly onOpenLocalNotes: () => void;
  readonly onFix: (thread: CommentThread) => void;
};

export const PrActivityMode = ({
  pr,
  comments,
  localNotes,
  onBack,
  onOpenUrl,
  onOpenLocalNotes,
  onFix,
}: Props) => {
  const general = useMemo(
    () => comments.filter((comment) => comment.source === 'issue'),
    [comments],
  );
  return (
    <ModeShell label="PR activity" onBack={onBack}>
      <PrConversation comments={general} pr={pr} onOpenUrl={onOpenUrl} onFix={onFix} />
      <LocalNotesSection comments={localNotes} onOpen={onOpenLocalNotes} />
    </ModeShell>
  );
};
