import type { SessionId } from '@goodboy/types';
import { refreshMountMr, type RefreshMrOptions } from './refreshMountMr';
import { listSessionMrTargets, resolveSessionMrTarget } from './resolveMrContext';
import type { GetFn, SetFn } from './types';

export type { RefreshMrOptions };

export const refreshSessionMr = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, opts?: RefreshMrOptions): Promise<void> => {
    const targets =
      opts?.mountId === undefined
        ? listSessionMrTargets({ get, sessionId })
        : [resolveSessionMrTarget({ get, sessionId, mountId: opts.mountId })].flatMap((target) =>
            target === null ? [] : [target],
          );
    await Promise.all(
      targets.map((target) => refreshMountMr({ set, get, sessionId, target, opts })),
    );
  };
};
