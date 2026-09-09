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
  | 'changed_since_accepted'
  | 'delivery_failed'
  | 'confirm_delivery'
  | 'run_failed'
  | 'wont_fix'
  | 'wont_fix_sent';

type Params = {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly activeAttempt: ResolveAttempt | null;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
};

export const resolveDeliveryReceiptsFor = ({
  item,
  thread,
  deliveryReceipts,
}: {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
}): ReadonlyArray<ResolvePublicationThread> =>
  deliveryReceipts.filter(
    (receipt) => receipt.threadId === thread.threadId && receipt.revision === item.approvedRevision,
  );

export const isDeliveryComplete = ({
  receipt,
}: {
  readonly receipt: ResolvePublicationThread;
}): boolean =>
  (receipt.replyPhase === 'posted' || receipt.replyPhase === 'skipped') &&
  (receipt.resolvePhase === 'resolved' || receipt.resolvePhase === 'skipped');

const isDeliveryUncertain = ({
  receipt,
}: {
  readonly receipt: ResolvePublicationThread;
}): boolean => receipt.replyPhase === 'uncertain' || receipt.resolvePhase === 'uncertain';

const deriveDeliveryStatus = ({
  item,
  thread,
  deliveryReceipts,
  delivered,
  undelivered,
}: {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
  readonly delivered: ResolveQueueStatus;
  readonly undelivered: ResolveQueueStatus;
}): ResolveQueueStatus => {
  const receipts = resolveDeliveryReceiptsFor({ item, thread, deliveryReceipts });
  if (item.deliveredAt !== null && receipts.some((receipt) => isDeliveryComplete({ receipt }))) {
    return delivered;
  }
  if (receipts.some((receipt) => receipt.error !== null)) {
    return 'delivery_failed';
  }
  if (receipts.some((receipt) => isDeliveryUncertain({ receipt }))) {
    return 'confirm_delivery';
  }
  return undelivered;
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
  const isStale = item.approvedRevision !== null && thread.revision > item.approvedRevision;
  if (item.approvalState === 'wont_fix') {
    if (isStale) {
      return 'changed_since_accepted';
    }
    return deriveDeliveryStatus({
      item,
      thread,
      deliveryReceipts,
      delivered: 'wont_fix_sent',
      undelivered: 'wont_fix',
    });
  }
  if (activeAttempt?.phase === 'running' || activeAttempt?.phase === 'queued') {
    return 'working';
  }
  if (thread.question !== null && thread.state === 'needs_answer') {
    return 'agent_asked';
  }
  if (item.approvalState === 'accepted' && isStale) {
    return 'changed_since_accepted';
  }
  if (item.approvalState === 'accepted') {
    return deriveDeliveryStatus({
      item,
      thread,
      deliveryReceipts,
      delivered: 'pushed',
      undelivered: 'ready_to_push',
    });
  }
  if (activeAttempt?.phase === 'failed' || activeAttempt?.phase === 'cancelled') {
    return 'run_failed';
  }
  return 'for_you';
};
