import type { ResolveThread } from '@goodboy/types';
import type { SessionGithubState } from '../../store/types';
import { groupThreads, type CommentThread } from '../github/comment-threads';

type Params = {
  readonly github: SessionGithubState | null;
  readonly rows: ReadonlyArray<ResolveThread>;
};

const isEligible = ({ row }: { readonly row: ResolveThread | undefined }): boolean =>
  row === undefined || row.state === 'open' || row.state === 'failed';

export const eligibleReviewThreads = ({ github, rows }: Params): ReadonlyArray<CommentThread> =>
  groupThreads(github?.detail?.comments ?? []).filter((thread) => {
    if (thread.head.source !== 'review' || thread.head.resolved !== false) {
      return false;
    }
    const threadId = thread.head.threadId;
    if (threadId == null) {
      return false;
    }
    return isEligible({ row: rows.find((candidate) => candidate.threadId === threadId) });
  });

export const eligibleReviewThreadCount = (params: Params): number =>
  eligibleReviewThreads(params).length;
