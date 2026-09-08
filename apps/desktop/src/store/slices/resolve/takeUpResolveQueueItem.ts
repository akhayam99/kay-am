import { undeferResolveQueueItem } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemParams, SliceParams } from './types';

type Params = SliceParams & ItemParams;

export const takeUpResolveQueueItem = async ({ set, sessionId, itemId }: Params): Promise<void> => {
  const takenUp = await undeferResolveQueueItem({ db: tauriDatabase, sessionId, itemId });
  if (!takenUp) {
    throw new Error('Resolve item could not be taken up');
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
