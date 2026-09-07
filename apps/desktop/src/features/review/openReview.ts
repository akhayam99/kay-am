import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../store';
import type { ReviewMode } from './reviewMode';

type Params = {
  readonly sessionId: SessionId;
  readonly prNumber?: number;
  readonly threadId?: string;
  readonly mode?: ReviewMode;
};

export const openReview = ({ sessionId, prNumber, threadId, mode }: Params): void => {
  const store = useAppStore.getState();
  if (prNumber !== undefined && store.sessionSelectedPrNumber[sessionId] !== prNumber) {
    void store.selectSessionPr(sessionId, prNumber);
  }
  store.setReviewLensIntent({
    intent: {
      sessionId,
      ...(threadId !== undefined && { threadId }),
      ...(prNumber !== undefined && { prNumber }),
      ...(mode !== undefined && { mode }),
    },
  });
  store.setActiveLens(sessionId, 'review');
};
