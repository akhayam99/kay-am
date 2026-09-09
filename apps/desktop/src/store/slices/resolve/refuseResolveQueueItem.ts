import { listResolveQueueItems, refuseResolveQueueItem as refuseItem } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { STALE_APPROVAL } from './acceptResolveQueueItem';
import { hashResolveReply } from './hashResolveReply';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemRevisionParams, SliceParams } from './types';

type Params = SliceParams & ItemRevisionParams;

export const REFUSAL_AFTER_INTEGRATION = 'Fix already integrated';
export const EMPTY_REFUSAL_REPLY = 'Write the reply the reviewer will read before you refuse';
export const REFUSAL_REPLY_OUT_OF_DATE =
  'This reply no longer matches the saved draft. Reopen the comment and try again';

export const refuseResolveQueueItem = async ({
  set,
  sessionId,
  itemId,
  revision,
  reply,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  if (reply.trim() === '') {
    throw new Error(EMPTY_REFUSAL_REPLY);
  }
  const entries = await listResolveQueueItems({ db, sessionId });
  const target = entries.find((entry) => entry.item.id === itemId);
  if (target !== undefined && target.item.integratedSha !== null) {
    throw new Error(REFUSAL_AFTER_INTEGRATION);
  }
  if (target !== undefined && target.thread.replyDraft !== reply) {
    throw new Error(REFUSAL_REPLY_OUT_OF_DATE);
  }
  const replyHash = await hashResolveReply({ reply });
  const refused = await refuseItem({ db, sessionId, itemId, revision, replyHash });
  if (!refused) {
    throw new Error(STALE_APPROVAL);
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
