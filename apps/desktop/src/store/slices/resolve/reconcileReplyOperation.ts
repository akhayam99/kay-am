import type { PrComment, ResolvePublicationThread } from '@goodboy/types';

export type ReplyOperationVerdict = 'posted' | 'not_posted' | 'ambiguous';

type Params = {
  readonly thread: ResolvePublicationThread;
  readonly comments: ReadonlyArray<PrComment>;
  readonly observedAt: number | null;
  readonly isObservationTrusted: boolean;
};

export const reconcileReplyOperation = ({
  thread,
  comments,
  observedAt,
  isObservationTrusted,
}: Params): ReplyOperationVerdict => {
  if (thread.replyPostedAt !== null || thread.replyPhase === 'posted') {
    return 'posted';
  }
  if (thread.replyPhase !== 'uncertain') {
    return 'not_posted';
  }
  if (thread.replyBody === null) {
    return 'not_posted';
  }
  if (!isObservationTrusted || observedAt === null) {
    return 'ambiguous';
  }
  if (thread.replyAttemptedAt !== null && observedAt < thread.replyAttemptedAt) {
    return 'ambiguous';
  }
  const seen = comments.filter(
    (comment) => comment.threadId === thread.threadId && comment.body === thread.replyBody,
  ).length;
  if (seen > 1) {
    return 'ambiguous';
  }
  return seen === 1 ? 'posted' : 'not_posted';
};
