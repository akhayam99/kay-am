import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';
import type { ResolveQueueRow } from './buildResolveQueueRows';

export type ResolveQueueGroups = {
  readonly needsReview: ReadonlyArray<ResolveQueueRow>;
  readonly active: ReadonlyArray<ResolveQueueRow>;
  readonly completed: ReadonlyArray<ResolveQueueRow>;
  readonly later: ReadonlyArray<ResolveQueueRow>;
};

export type ResolveQueueListGroup = {
  readonly key: string;
  readonly attemptId: string | null;
  readonly rows: ReadonlyArray<ResolveQueueRow>;
};

const NEEDS_REVIEW_STATUSES: ReadonlySet<ResolveQueueStatus> = new Set([
  'for_you',
  'agent_asked',
  'changed_since_accepted',
  'delivery_failed',
  'confirm_delivery',
]);

const HISTORY_STATUSES: ReadonlySet<ResolveQueueStatus> = new Set(['later', 'pushed']);

const reviewerTimeOf = ({ row }: { readonly row: ResolveQueueRow }): number =>
  row.reviewerNote?.createdAtMs ?? row.thread.createdAt;

const byReviewerTime = (a: ResolveQueueRow, b: ResolveQueueRow): number =>
  reviewerTimeOf({ row: a }) - reviewerTimeOf({ row: b });

export const groupResolveQueue = ({
  rows,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
}): ResolveQueueGroups => ({
  needsReview: rows
    .filter((row) => NEEDS_REVIEW_STATUSES.has(row.status))
    .slice()
    .sort(byReviewerTime),
  active: rows
    .filter((row) => !HISTORY_STATUSES.has(row.status))
    .slice()
    .sort(byReviewerTime),
  completed: rows
    .filter((row) => row.status === 'pushed')
    .slice()
    .sort(byReviewerTime),
  later: rows
    .filter((row) => row.status === 'later')
    .slice()
    .sort(byReviewerTime),
});

export const groupSharedRuns = ({
  rows,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
}): ReadonlyArray<ResolveQueueListGroup> => {
  const groups: Array<{
    readonly key: string;
    readonly attemptId: string | null;
    readonly rows: Array<ResolveQueueRow>;
  }> = [];
  const indexByAttemptId = new Map<string, number>();
  for (const row of rows) {
    const attemptId = row.thread.activeAttemptId;
    if (attemptId === null) {
      groups.push({ key: row.thread.threadId, attemptId: null, rows: [row] });
      continue;
    }
    const index = indexByAttemptId.get(attemptId);
    if (index === undefined) {
      indexByAttemptId.set(attemptId, groups.length);
      groups.push({ key: attemptId, attemptId, rows: [row] });
      continue;
    }
    groups[index]?.rows.push(row);
  }
  return groups.map((group) => ({
    key: group.key,
    attemptId: group.rows.length > 1 ? group.attemptId : null,
    rows: group.rows,
  }));
};
