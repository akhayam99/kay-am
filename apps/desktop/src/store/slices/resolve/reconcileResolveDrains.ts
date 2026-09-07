import { listActiveResolveAttempts, listResolveAttempts, listResolveThreads } from '@goodboy/db';
import type { SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { drainResolveQueue } from './drainResolveQueue';
import { reconcileResolveAttempts } from './reconcileResolveAttempts';
import type { SliceParams } from './types';

export const reconcileResolveDrains = async ({ set, get }: SliceParams): Promise<void> => {
  const active = await listActiveResolveAttempts({ db: tauriDatabase });
  for (const sessionId of new Set<SessionId>(active.map((attempt) => attempt.sessionId))) {
    await reconcileResolveAttempts({
      set,
      get,
      sessionId,
      rows: await listResolveThreads({ db: tauriDatabase, sessionId }),
      attempts: await listResolveAttempts({ db: tauriDatabase, sessionId }),
    });
    await drainResolveQueue({ set, get, sessionId });
  }
};
