import { REFUSAL_AFTER_INTEGRATION } from '../../store/slices/resolve/refuseResolveQueueItem';
import type { ResolveQueueRow } from './buildResolveQueueRows';

export const refuseBlockedReason = ({ row }: { readonly row: ResolveQueueRow }): string | null =>
  row.item.integratedSha === null ? null : REFUSAL_AFTER_INTEGRATION;
