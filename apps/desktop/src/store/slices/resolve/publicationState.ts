import { listResolvePublicationsForSession } from '@goodboy/db';
import type { SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { SetFn } from './types';

type Params = { readonly set: SetFn; readonly sessionId: SessionId };

export const loadPublicationsInto = async ({ set, sessionId }: Params): Promise<void> => {
  const publications = await listResolvePublicationsForSession({
    db: tauriDatabase,
    sessionId,
  }).catch(() => null);
  if (publications === null) {
    return;
  }
  set((state) => ({
    sessionResolvePublications: {
      ...state.sessionResolvePublications,
      [sessionId]: publications,
    },
  }));
};
