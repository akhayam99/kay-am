import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';
import type { ResolveQueueRow } from './buildResolveQueueRows';

export type ResolveQueueGroups = {
  readonly forYou: ReadonlyArray<ResolveQueueRow>;
  readonly workingCount: number;
  readonly readyToPushCount: number;
  readonly pushed: ReadonlyArray<ResolveQueueRow>;
  readonly later: ReadonlyArray<ResolveQueueRow>;
};

const FOR_YOU_STATUSES: ReadonlySet<ResolveQueueStatus> = new Set([
  'for_you',
  'agent_asked',
  'changed_since_accepted',
]);

const reviewerTimeOf = ({ row }: { readonly row: ResolveQueueRow }): number =>
  row.reviewerNote?.createdAtMs ?? row.thread.createdAt;

export const groupResolveQueue = ({
  rows,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
}): ResolveQueueGroups => {
  const forYou = rows
    .filter((row) => FOR_YOU_STATUSES.has(row.status))
    .slice()
    .sort((a, b) => reviewerTimeOf({ row: a }) - reviewerTimeOf({ row: b }));
  return {
    forYou,
    workingCount: rows.filter((row) => row.status === 'working').length,
    readyToPushCount: rows.filter((row) => row.status === 'ready_to_push').length,
    pushed: rows.filter((row) => row.status === 'pushed'),
    later: rows.filter((row) => row.status === 'later'),
  };
};
