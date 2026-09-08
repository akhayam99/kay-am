import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';
import type { ResolveQueueRow } from './buildResolveQueueRows';

export type ResolveQueueChecksSummary = {
  readonly additions: number;
  readonly deletions: number;
  readonly passCount: number;
  readonly totalCount: number;
};

const SMALL_CHANGE_LINE_LIMIT = 20;

export const isInlineAcceptEligible = ({
  status,
  checks,
}: {
  readonly status: ResolveQueueStatus;
  readonly checks: ResolveQueueChecksSummary | null;
}): boolean => {
  if (status !== 'for_you') {
    return false;
  }
  if (checks === null) {
    return false;
  }
  if (checks.totalCount === 0) {
    return false;
  }
  if (checks.passCount !== checks.totalCount) {
    return false;
  }
  if (checks.additions + checks.deletions > SMALL_CHANGE_LINE_LIMIT) {
    return false;
  }
  return true;
};

export const isAcceptAllEligible = ({
  rows,
  checksByThreadId,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
  readonly checksByThreadId: ReadonlyMap<string, ResolveQueueChecksSummary | null>;
}): boolean => {
  const candidates = rows.filter((row) => row.status === 'for_you');
  if (candidates.length === 0) {
    return false;
  }
  return candidates.every((row) => {
    if (row.coveredThreadIds.length > 0) {
      return false;
    }
    const checks = checksByThreadId.get(row.thread.threadId) ?? null;
    return isInlineAcceptEligible({ status: row.status, checks });
  });
};
