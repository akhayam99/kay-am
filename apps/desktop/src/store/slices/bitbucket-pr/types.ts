import type { MountId, SessionId } from '@goodboy/types';
import type { BitbucketRepo } from '../../../features/integrations/bitbucket/client';

export type { SetFn, GetFn } from '../../slice-types';

export type BitbucketPrWriteParams = {
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
  readonly repo: BitbucketRepo;
  readonly pullRequestId: number;
};

export type BitbucketPrCommentParams = BitbucketPrWriteParams & {
  readonly body: string;
};

export type BitbucketPrReplyParams = BitbucketPrCommentParams & {
  readonly parentCommentId: number;
};
