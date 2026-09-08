import { bitbucketUnrequestChanges } from '../../../features/integrations/bitbucket/client';
import { runBitbucketPrWrite } from './runBitbucketPrWrite';
import type { BitbucketPrWriteParams, GetFn, SetFn } from './types';

export const withdrawBitbucketPrChanges = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId, repo, pullRequestId }: BitbucketPrWriteParams) => {
    await runBitbucketPrWrite({
      set,
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
      repo,
      pullRequestId,
      write: async () => {
        await bitbucketUnrequestChanges({ ...repo, pullRequestId });
      },
    });
  };
};
