import type { FileDiff, PrCheckRun } from '@goodboy/types';
import type { ResolveQueueChecksSummary } from './isInlineAcceptEligible';

export const resolveQueueChecksSummary = ({
  checks,
  fileDiff,
}: {
  readonly checks: ReadonlyArray<PrCheckRun>;
  readonly fileDiff: FileDiff | null;
}): ResolveQueueChecksSummary => ({
  totalCount: checks.length,
  passCount: checks.filter((check) => check.conclusion === 'success').length,
  additions: fileDiff?.additions ?? 0,
  deletions: fileDiff?.deletions ?? 0,
});

export const buildResolveQueueChecksByThreadId = ({
  threadPaths,
  checks,
  files,
}: {
  readonly threadPaths: ReadonlyMap<string, string | null>;
  readonly checks: ReadonlyArray<PrCheckRun>;
  readonly files: ReadonlyArray<FileDiff>;
}): ReadonlyMap<string, ResolveQueueChecksSummary | null> => {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const map = new Map<string, ResolveQueueChecksSummary | null>();
  for (const [threadId, path] of threadPaths) {
    const fileDiff = path === null ? null : (fileByPath.get(path) ?? null);
    map.set(threadId, fileDiff === null ? null : resolveQueueChecksSummary({ checks, fileDiff }));
  }
  return map;
};
