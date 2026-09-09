import type { ResolvePublicationExclusion, ResolveThread } from '@goodboy/types';

type Params = {
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly threadIds?: ReadonlyArray<string>;
  readonly refusedThreadIds?: ReadonlySet<string>;
};

export type PublishableSelection = {
  readonly publishable: ReadonlyArray<ResolveThread>;
  readonly excluded: ReadonlyArray<ResolvePublicationExclusion>;
};

const PUBLICATION_FAILED = 'publication_failed:';

type SettledParams = {
  readonly row: ResolveThread;
  readonly refusedThreadIds: ReadonlySet<string>;
};

const isSettled = ({ row, refusedThreadIds }: SettledParams): boolean =>
  row.state === 'fixed' || row.state === 'answered' || refusedThreadIds.has(row.threadId);

const exclusionReason = ({
  row,
}: {
  readonly row: ResolveThread;
}): ResolvePublicationExclusion['reason'] => {
  if (
    row.state === 'fixed' ||
    row.state === 'answered' ||
    row.state === 'needs_answer' ||
    row.state === 'failed'
  ) {
    return 'needs_you';
  }
  if (row.state === 'working' || row.state === 'publishing') {
    return 'working';
  }
  return 'not_ready';
};

export const selectPublishableThreads = ({
  rows,
  threadIds,
  refusedThreadIds = new Set<string>(),
}: Params): PublishableSelection => {
  const requested = threadIds === undefined ? null : new Set(threadIds);
  const publishable: Array<ResolveThread> = [];
  const excluded: Array<ResolvePublicationExclusion> = [];
  for (const row of rows) {
    if (requested !== null && !requested.has(row.threadId)) {
      continue;
    }
    const hasFailedPublication = row.stateReason?.startsWith(PUBLICATION_FAILED) === true;
    if (isSettled({ row, refusedThreadIds }) && (requested !== null || !hasFailedPublication)) {
      publishable.push(row);
      continue;
    }
    excluded.push({ threadId: row.threadId, reason: exclusionReason({ row }) });
  }
  return { publishable, excluded };
};
