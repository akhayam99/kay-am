import type { Session } from '@goodboy/types';
import { PANE_RHYTHM, cn } from '@goodboy/ui';
import { WriteReview } from '../WriteReview';
import { BackToConversationsButton } from './BackToConversationsButton';

type Props = {
  readonly session: Session;
  readonly listWidth: number;
  readonly onBack: () => void;
};

export const WriteReviewMode = ({ session, listWidth, onBack }: Props) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <div className={cn('flex shrink-0 items-center', PANE_RHYTHM.rail.header)}>
      <BackToConversationsButton onClick={onBack} />
    </div>
    <WriteReview session={session} listWidth={listWidth} />
  </div>
);
