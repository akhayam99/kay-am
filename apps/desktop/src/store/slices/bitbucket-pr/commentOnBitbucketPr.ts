import { bitbucketCreatePullRequestComment } from '../../../features/integrations/bitbucket/client';
import { appendAttribution } from '../../../shared/utils/attribution';
import { isSessionAttributionEnabled } from '../../sessionAttribution';
import { runBitbucketPrWrite } from './runBitbucketPrWrite';
import type { BitbucketPrCommentParams, GetFn, SetFn } from './types';

export const commentOnBitbucketPr = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId, repo, pullRequestId, body }: BitbucketPrCommentParams) => {
    const attributedBody = appendAttribution({
      body,
      isEnabled: isSessionAttributionEnabled({ get, sessionId }),
      syntax: 'markdown',
    });
    await runBitbucketPrWrite({
      set,
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
      repo,
      pullRequestId,
      write: async () => {
        await bitbucketCreatePullRequestComment({
          ...repo,
          pullRequestId,
          body: attributedBody,
        });
      },
    });
  };
};
