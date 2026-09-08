import { bitbucketRequestChanges } from '../../../features/integrations/bitbucket/client';
import { runBitbucketPrWrite } from './runBitbucketPrWrite';
import type { BitbucketPrWriteParams, GetFn, SetFn } from './types';

export const requestBitbucketPrChanges = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId, repo, pullRequestId }: BitbucketPrWriteParams) => {
    await runBitbucketPrWrite({
      set,
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
      repo,
      pullRequestId,
      write: async () => {
        await bitbucketRequestChanges({ ...repo, pullRequestId });
      },
    });
  };
};
