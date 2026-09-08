import { deferResolveQueueItem as deferItem, listResolveQueueItems } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemParams, SliceParams } from './types';

type Params = SliceParams & ItemParams;

export const DEFER_AFTER_INTEGRATION =
  'This change is already on the branch. Reopen the comment to work on it again';

export const deferResolveQueueItem = async ({ set, sessionId, itemId }: Params): Promise<void> => {
  const db = tauriDatabase;
  const entries = await listResolveQueueItems({ db, sessionId });
  const target = entries.find((entry) => entry.item.id === itemId);
  if (target !== undefined && target.item.integratedSha !== null) {
    throw new Error(DEFER_AFTER_INTEGRATION);
  }
  const deferred = await deferItem({ db, sessionId, itemId });
  if (!deferred) {
    throw new Error('Resolve item could not be deferred');
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
