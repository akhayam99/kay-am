import type { SessionMountView } from '@goodboy/types';
import { runMountRecoveryOnce } from './mountRecoveryGuard';
import { applyMountViews, loadMountViews } from './mountViews';
import { recoverMountOperations } from './recoverMountOperations';
import { verifyMountViews } from './verifyMountViews';
import type { GetFn, SessionKeyInput, SetFn } from './types';

export const loadSessionMounts = (set: SetFn, get: GetFn) => {
  return async ({ sessionId }: SessionKeyInput): Promise<ReadonlyArray<SessionMountView>> => {
    const views = await loadMountViews({ get, sessionId });
    const verifiedViews = await verifyMountViews({ get, sessionId, views });
    applyMountViews({ set, sessionId, views: verifiedViews });
    runMountRecoveryOnce({
      sessionId,
      run: () => recoverMountOperations(set, get)({ sessionId }),
    });
    return verifiedViews;
  };
};
