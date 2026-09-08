import { approveBitbucketPr } from './approveBitbucketPr';
import { commentOnBitbucketPr } from './commentOnBitbucketPr';
import { declineBitbucketPr } from './declineBitbucketPr';
import { mergeBitbucketPr } from './mergeBitbucketPr';
import { refreshSessionBitbucketPr } from './refreshSessionBitbucketPr';
import { replyToBitbucketPrComment } from './replyToBitbucketPrComment';
import { requestBitbucketPrChanges } from './requestBitbucketPrChanges';
import { selectSessionBitbucketPr } from './selectSessionBitbucketPr';
import { unapproveBitbucketPr } from './unapproveBitbucketPr';
import { withdrawBitbucketPrChanges } from './withdrawBitbucketPrChanges';
import type { GetFn, SetFn } from './types';

export { initialBitbucketPrState } from './state';
export type { RefreshSessionBitbucketPrOptions } from './refreshMountBitbucketPr';
export type {
  BitbucketPrCommentParams,
  BitbucketPrReplyParams,
  BitbucketPrWriteParams,
} from './types';

export const createBitbucketPrSlice = (set: SetFn, get: GetFn) => ({
  refreshSessionBitbucketPr: refreshSessionBitbucketPr(set, get),
  selectSessionBitbucketPr: selectSessionBitbucketPr(set, get),
  approveBitbucketPr: approveBitbucketPr(set, get),
  unapproveBitbucketPr: unapproveBitbucketPr(set, get),
  requestBitbucketPrChanges: requestBitbucketPrChanges(set, get),
  withdrawBitbucketPrChanges: withdrawBitbucketPrChanges(set, get),
  mergeBitbucketPr: mergeBitbucketPr(set, get),
  declineBitbucketPr: declineBitbucketPr(set, get),
  commentOnBitbucketPr: commentOnBitbucketPr(set, get),
  replyToBitbucketPrComment: replyToBitbucketPrComment(set, get),
});
