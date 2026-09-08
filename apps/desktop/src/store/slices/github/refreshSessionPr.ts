import type { SessionId } from '@goodboy/types';
import { refreshMountPr, type RefreshPrOptions } from './refreshMountPr';
import { listSessionPrFetches, resolveSessionPrFetch } from './resolveSessionPrFetch';
import type { GetFn, SetFn } from './types';

export type { RefreshPrOptions };

export const refreshSessionPr = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, opts?: RefreshPrOptions): Promise<void> => {
    const state = get();
    const targets =
      opts?.mountId === undefined
        ? listSessionPrFetches({ state, sessionId })
        : [resolveSessionPrFetch({ state, sessionId, mountId: opts.mountId })].flatMap((target) =>
            target === null ? [] : [target],
          );
    await Promise.all(
      targets.map((target) => refreshMountPr({ set, get, sessionId, target, opts })),
    );
  };
};
