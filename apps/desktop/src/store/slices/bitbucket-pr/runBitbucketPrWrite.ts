import type { MountId, SessionId } from '@goodboy/types';
import type { BitbucketRepo } from '../../../features/integrations/bitbucket/client';
import { bitbucketRequestIdentity } from './bitbucketPrLink';
import { applyMountBitbucketPr } from './mountBitbucketPr';
import { resolveSessionBitbucketTarget } from './resolveBitbucketPrContext';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
  readonly repo: BitbucketRepo;
  readonly pullRequestId: number;
  readonly write: () => Promise<void>;
};

export const runBitbucketPrWrite = async ({
  set,
  get,
  sessionId,
  mountId,
  repo,
  pullRequestId,
  write,
}: Params): Promise<void> => {
  const target = resolveSessionBitbucketTarget({
    get,
    sessionId,
    ...(mountId === undefined ? {} : { mountId }),
  });
  await write();
  if (target === null) {
    return;
  }
  const targetMountId = target.mount.id;
  set((state) =>
    applyMountBitbucketPr({
      state,
      sessionId,
      mountId: targetMountId,
      selected: bitbucketRequestIdentity({ repo, pullRequestId }),
    }),
  );
  await get().refreshSessionBitbucketPr(sessionId, { force: true, mountId: targetMountId });
};
