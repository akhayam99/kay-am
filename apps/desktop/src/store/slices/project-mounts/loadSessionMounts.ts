import type { SessionMountView } from '@goodboy/types';
import { applyMountViews, loadMountViews } from './mountViews';
import type { GetFn, SessionKeyInput, SetFn } from './types';

export const loadSessionMounts = (set: SetFn, get: GetFn) => {
  return async ({ sessionId }: SessionKeyInput): Promise<ReadonlyArray<SessionMountView>> => {
    const views = await loadMountViews({ get, sessionId });
    applyMountViews({ set, sessionId, views });
    return views;
  };
};
