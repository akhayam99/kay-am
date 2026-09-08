import { setResolveQueueItemApproval } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import type { ItemRevisionParams, SliceParams } from './types';

type Params = SliceParams & ItemRevisionParams;

const hashReply = async ({ reply }: { readonly reply: string }): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reply));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
};

export const acceptResolveQueueItem = async ({
  set,
  sessionId,
  itemId,
  revision,
  reply,
}: Params): Promise<void> => {
  const replyHash = await hashReply({ reply });
  const accepted = await setResolveQueueItemApproval({
    db: tauriDatabase,
    sessionId,
    itemId,
    revision,
    replyHash,
  });
  if (!accepted) {
    throw new Error('Approval revision is stale');
  }
  await loadResolveQueueItemsInto({ set, sessionId });
};
