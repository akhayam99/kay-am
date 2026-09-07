import { setResolvePublicationPhase } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadPublicationsInto } from './publicationState';
import type { PublishParams, SliceParams } from './types';

type Params = SliceParams & PublishParams;

export const cancelPublication = async ({
  set,
  sessionId,
  publicationId,
}: Params): Promise<void> => {
  await setResolvePublicationPhase({
    db: tauriDatabase,
    id: publicationId,
    phase: 'cancelled',
    error: 'cancelled',
  });
  await loadPublicationsInto({ set, sessionId });
  set((state) => ({
    activePublicationPreview: { ...state.activePublicationPreview, [sessionId]: null },
  }));
};
