import type { ResolveThread, SessionId } from '@goodboy/types';

export const DIRTY_TREE_REASON = 'dirty_tree';

const DIRTY_TREE_PATTERN = new RegExp(`(^|:)${DIRTY_TREE_REASON}(:|$)`);

export const isDirtyTreeRow = ({ row }: { readonly row: ResolveThread }): boolean =>
  DIRTY_TREE_PATTERN.test(row.stateReason ?? '');

export const withDirtyTreeReason = ({ row }: { readonly row: ResolveThread }): string => {
  if (row.stateReason === null) {
    return DIRTY_TREE_REASON;
  }
  if (isDirtyTreeRow({ row })) {
    return row.stateReason;
  }
  return row.stateReason.replace(
    /^((?:(?:missing_result|stopped|failed):)*)/,
    `$1${DIRTY_TREE_REASON}:`,
  );
};

export const clearDirtyTreeReason = ({ row }: { readonly row: ResolveThread }): string | null => {
  const next = (row.stateReason ?? '')
    .split(':')
    .filter((part) => part !== DIRTY_TREE_REASON)
    .join(':');
  return next === '' ? null : next;
};

export const selectDirtyTreeThreads = ({
  sessionResolveThreads,
  sessionId,
}: {
  readonly sessionResolveThreads: Readonly<Record<SessionId, ReadonlyArray<ResolveThread>>>;
  readonly sessionId: SessionId;
}): ReadonlyArray<string> =>
  (sessionResolveThreads[sessionId] ?? [])
    .filter((row) => isDirtyTreeRow({ row }))
    .map((row) => row.threadId);
