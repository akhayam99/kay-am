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
  | 'wont_fix'
  | 'wont_fix_sent'
  | 'changed_since_accepted';

type Params = {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly activeAttempt: ResolveAttempt | null;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
};

type ReceiptParams = Omit<Params, 'activeAttempt'>;

const isDelivered = ({ item, thread, deliveryReceipts }: ReceiptParams): boolean =>
  item.deliveredAt !== null &&
  deliveryReceipts.some(
    (receipt) =>
      receipt.threadId === thread.threadId &&
      receipt.revision === item.approvedRevision &&
      (receipt.replyPostedAt !== null || receipt.resolvedAt !== null),
  );

export const deriveResolveQueueStatus = ({
  item,
  thread,
  activeAttempt,
  deliveryReceipts,
}: Params): ResolveQueueStatus => {
  if (item.approvalState === 'deferred') {
    return 'later';
  }
  const isStale = item.approvedRevision !== null && thread.revision > item.approvedRevision;
  if (item.approvalState === 'wont_fix') {
    if (isStale) {
      return 'changed_since_accepted';
    }
    return isDelivered({ item, thread, deliveryReceipts }) ? 'wont_fix_sent' : 'wont_fix';
  }
  if (activeAttempt?.phase === 'running') {
    return 'working';
  }
  if (thread.question !== null && thread.state === 'needs_answer') {
    return 'agent_asked';
  }
  if (item.approvalState === 'accepted' && isStale) {
    return 'changed_since_accepted';
  }
  if (item.approvalState === 'accepted') {
    return isDelivered({ item, thread, deliveryReceipts }) ? 'pushed' : 'ready_to_push';
  }
  return 'for_you';
};
