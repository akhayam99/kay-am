import { RESOLVE_DELIVERY_SUPPORT } from './resolveQueueCopy';
import type { ResolveQueueRow } from './buildResolveQueueRows';

export const deliverySupportLine = ({ row }: { readonly row: ResolveQueueRow }): string | null => {
  const delivery = row.delivery;
  if (delivery === null) {
    return row.status === 'ready_to_push' || row.status === 'wont_fix'
      ? RESOLVE_DELIVERY_SUPPORT.replyPending
      : null;
  }
  const reply = delivery.isReplyPosted
    ? RESOLVE_DELIVERY_SUPPORT.replyPosted
    : RESOLVE_DELIVERY_SUPPORT.replyPending;
  const thread = delivery.isThreadResolved
    ? RESOLVE_DELIVERY_SUPPORT.threadResolved
    : RESOLVE_DELIVERY_SUPPORT.threadLeftOpen;
  return `${reply} · ${thread}`;
};
