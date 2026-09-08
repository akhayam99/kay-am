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

export const resolveQueueNeighbours = ({
  rows,
  threadId,
}: {
  readonly rows: ReadonlyArray<ResolveQueueRow>;
  readonly threadId: string | null;
}): {
  readonly index: number;
  readonly previousThreadId: string | null;
  readonly nextThreadId: string | null;
} => {
  const index = rows.findIndex((row) => row.thread.threadId === threadId);
  if (index === -1) {
    return { index: -1, previousThreadId: null, nextThreadId: null };
  }
  return {
    index,
    previousThreadId: rows[index - 1]?.thread.threadId ?? null,
    nextThreadId: rows[index + 1]?.thread.threadId ?? null,
  };
};
