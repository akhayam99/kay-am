import type { MountId, SessionId } from '@goodboy/types';
import { bitbucketRequestIdentity } from './bitbucketPrLink';
import { applyMountBitbucketPr } from './mountBitbucketPr';
import {
  resolveBitbucketPrContext,
  resolveSessionBitbucketTarget,
} from './resolveBitbucketPrContext';
import type { GetFn, SetFn } from './types';

export const selectSessionBitbucketPr = (set: SetFn, get: GetFn) => {
  return async (
    sessionId: SessionId,
    pullRequestId: number | null,
    mountId?: MountId,
  ): Promise<void> => {
    const target = resolveSessionBitbucketTarget({
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    if (target === null) {
      return;
    }
    const targetMountId = target.mount.id;
    const known = get().mountBitbucketPr?.[targetMountId]?.repo ?? null;
    const repo = known ?? (await resolveBitbucketPrContext({ get, target }))?.repo ?? null;
    const selected =
      pullRequestId === null || repo === null
        ? null
        : bitbucketRequestIdentity({ repo, pullRequestId });
    set((state) => applyMountBitbucketPr({ state, sessionId, mountId: targetMountId, selected }));
    await get().refreshSessionBitbucketPr(sessionId, { force: true, mountId: targetMountId });
  };
};
