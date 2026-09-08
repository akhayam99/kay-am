import type { ResolvePublicationExclusion, ResolveThread } from '@goodboy/types';

type Params = {
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly threadIds?: ReadonlyArray<string>;
};

export type PublishableSelection = {
  readonly publishable: ReadonlyArray<ResolveThread>;
  readonly excluded: ReadonlyArray<ResolvePublicationExclusion>;
};

const PUBLICATION_FAILED = 'publication_failed:';

const isSettled = ({ row }: { readonly row: ResolveThread }): boolean =>
  row.state === 'fixed' || row.state === 'answered';

const exclusionReason = ({
  row,
}: {
  readonly row: ResolveThread;
}): ResolvePublicationExclusion['reason'] => {
  if (isSettled({ row }) || row.state === 'needs_answer' || row.state === 'failed') {
    return 'needs_you';
  }
  if (row.state === 'working' || row.state === 'publishing') {
    return 'working';
  }
  return 'not_ready';
};

export const selectPublishableThreads = ({ rows, threadIds }: Params): PublishableSelection => {
  const requested = threadIds === undefined ? null : new Set(threadIds);
  const publishable: Array<ResolveThread> = [];
  const excluded: Array<ResolvePublicationExclusion> = [];
  for (const row of rows) {
    if (requested !== null && !requested.has(row.threadId)) {
      continue;
    }
    const hasFailedPublication = row.stateReason?.startsWith(PUBLICATION_FAILED) === true;
    if (isSettled({ row }) && (requested !== null || !hasFailedPublication)) {
      publishable.push(row);
      continue;
    }
    excluded.push({ threadId: row.threadId, reason: exclusionReason({ row }) });
  }
  return { publishable, excluded };
};
