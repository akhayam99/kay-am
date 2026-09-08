import { deferResolveQueueItem as deferItem } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemParams, SliceParams } from './types';

type Params = SliceParams & ItemParams;

export const deferResolveQueueItem = async ({ set, sessionId, itemId }: Params): Promise<void> => {
  const deferred = await deferItem({ db: tauriDatabase, sessionId, itemId });
  if (!deferred) {
    throw new Error('Resolve item could not be deferred');
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
