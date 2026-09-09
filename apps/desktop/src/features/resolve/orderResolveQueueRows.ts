import type { ResolveQueueRow } from './buildResolveQueueRows';

type Params = {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
  readonly pinned: ReadonlyArray<string>;
};

export const orderResolveQueueRows = ({ rows, pinned }: Params): ReadonlyArray<ResolveQueueRow> => {
  if (pinned.length === 0) {
    return rows;
  }
  const byThreadId = new Map(rows.map((row) => [row.thread.threadId, row]));
  const kept = pinned.flatMap((threadId) => {
    const row = byThreadId.get(threadId);
    return row === undefined ? [] : [row];
  });
  const pinnedIds = new Set(pinned);
  const appended = rows.filter((row) => !pinnedIds.has(row.thread.threadId));
  return [...kept, ...appended];
};
