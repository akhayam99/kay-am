import { reopenResolveQueueItem as reopenItem } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemRevisionParams, SliceParams } from './types';

type Params = SliceParams & Omit<ItemRevisionParams, 'reply'>;

export const reopenResolveQueueItem = async ({
  set,
  sessionId,
  itemId,
  revision,
}: Params): Promise<void> => {
  const reopened = await reopenItem({
    db: tauriDatabase,
    sessionId,
    itemId,
    id: crypto.randomUUID(),
    candidateRevision: revision,
  });
  if (reopened === null) {
    throw new Error('Resolve item could not be reopened');
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
