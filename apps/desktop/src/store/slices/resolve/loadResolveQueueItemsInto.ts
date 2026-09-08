import { listResolveQueueItems } from '@goodboy/db';
import type { SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { SetFn } from './types';

type Params = { readonly set: SetFn; readonly sessionId: SessionId };

export const loadResolveQueueItemsInto = async ({ set, sessionId }: Params): Promise<void> => {
  const items = await listResolveQueueItems({ db: tauriDatabase, sessionId });
  set((state) => ({
    sessionResolveQueueItems: { ...state.sessionResolveQueueItems, [sessionId]: items },
  }));
};
