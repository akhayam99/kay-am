import type { SessionId } from '@goodboy/types';
import {
  refreshMountBitbucketPr,
  type RefreshSessionBitbucketPrOptions,
} from './refreshMountBitbucketPr';
import {
  listSessionBitbucketTargets,
  resolveSessionBitbucketTarget,
} from './resolveBitbucketPrContext';
import type { GetFn, SetFn } from './types';

export type { RefreshSessionBitbucketPrOptions };

export const refreshSessionBitbucketPr = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, opts?: RefreshSessionBitbucketPrOptions): Promise<void> => {
    const targets =
      opts?.mountId === undefined
        ? listSessionBitbucketTargets({ get, sessionId })
        : [resolveSessionBitbucketTarget({ get, sessionId, mountId: opts.mountId })].flatMap(
            (target) => (target === null ? [] : [target]),
          );
    await Promise.all(
      targets.map((target) => refreshMountBitbucketPr({ set, get, sessionId, target, opts })),
    );
  };
};
