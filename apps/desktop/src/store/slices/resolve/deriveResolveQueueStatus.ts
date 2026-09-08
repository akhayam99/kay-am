import type {
  ResolveAttempt,
  ResolvePublicationThread,
  ResolveQueueItem,
  ResolveThread,
} from '@goodboy/types';

export type ResolveQueueStatus =
  | 'for_you'
  | 'agent_asked'
  | 'working'
  | 'ready_to_push'
  | 'pushed'
  | 'later'
  | 'changed_since_accepted';

type Params = {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly activeAttempt: ResolveAttempt | null;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
};

export const deriveResolveQueueStatus = ({
  item,
  thread,
  activeAttempt,
  deliveryReceipts,
}: Params): ResolveQueueStatus => {
  if (item.approvalState === 'deferred') {
    return 'later';
  }
  if (activeAttempt?.phase === 'running') {
    return 'working';
  }
  if (thread.question !== null && thread.state === 'needs_answer') {
    return 'agent_asked';
  }
  if (
    item.approvalState === 'accepted' &&
    item.approvedRevision !== null &&
    thread.revision > item.approvedRevision
  ) {
    return 'changed_since_accepted';
  }
  if (item.approvalState === 'accepted') {
    const hasReceipt = deliveryReceipts.some(
      (receipt) =>
        receipt.threadId === thread.threadId &&
        receipt.revision === item.approvedRevision &&
        (receipt.replyPostedAt !== null || receipt.resolvedAt !== null),
    );
    if (item.deliveredAt !== null && hasReceipt) {
      return 'pushed';
    }
    return 'ready_to_push';
  }
  return 'for_you';
};
