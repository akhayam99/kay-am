import { bitbucketReplyToPullRequestComment } from '../../../features/integrations/bitbucket/client';
import { appendAttribution } from '../../../shared/utils/attribution';
import { isSessionAttributionEnabled } from '../../sessionAttribution';
import { runBitbucketPrWrite } from './runBitbucketPrWrite';
import type { BitbucketPrReplyParams, GetFn, SetFn } from './types';

export const replyToBitbucketPrComment = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    repo,
    pullRequestId,
    parentCommentId,
    body,
  }: BitbucketPrReplyParams) => {
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
        await bitbucketReplyToPullRequestComment({
          ...repo,
          pullRequestId,
          parentCommentId,
          body: attributedBody,
        });
      },
    });
  };
};
