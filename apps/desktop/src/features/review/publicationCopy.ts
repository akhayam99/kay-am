import type { PublicationBlocker, ResolvePublicationPreview } from '@goodboy/types';

const plural = ({
  count,
  one,
  many,
}: {
  readonly count: number;
  readonly one: string;
  readonly many: string;
}): string => `${count} ${count === 1 ? one : many}`;

const repliesLabel = ({ count }: { readonly count: number }): string =>
  plural({ count, one: 'reply', many: 'replies' });

const conversationsLabel = ({ count }: { readonly count: number }): string =>
  plural({ count, one: 'conversation', many: 'conversations' });

export const previewSentence = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string => {
  const replies = preview.replies.length;
  const closes = preview.replies.filter((reply) => reply.closes).length;
  if (!preview.requiresPush) {
    return `Post ${repliesLabel({ count: replies })} and resolve ${conversationsLabel({ count: closes })}. No code will be pushed.`;
  }
  const commits = plural({ count: preview.commits.length, one: 'commit', many: 'commits' });
  return `Push ${commits} to ${preview.branch}; post ${repliesLabel({ count: replies })}; resolve ${conversationsLabel({ count: closes })}.`;
};

export const excludedSentence = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null => {
  const count = preview.excluded.length;
  if (count === 0) {
    return null;
  }
  return `${conversationsLabel({ count })} ${count === 1 ? 'needs' : 'need'} you first.`;
};

export type BlockerCopy = {
  readonly sentence: string;
  readonly action: 'open_diff' | 'view_work' | 'recheck_fix' | 'refresh' | null;
};

export const blockerCopy = ({
  blocker,
  prNumber,
}: {
  readonly blocker: PublicationBlocker;
  readonly prNumber: number;
}): BlockerCopy => {
  switch (blocker) {
    case 'uncaptured_work':
      return { sentence: 'The branch carries work nobody approved', action: 'view_work' };
    case 'dirty_tree':
      return { sentence: 'Worktree has uncommitted changes', action: 'open_diff' };
    case 'writer_busy':
      return { sentence: 'A fix is still running on this worktree', action: 'view_work' };
    case 'publication_in_progress':
      return { sentence: `Another publication is in progress for #${prNumber}`, action: null };
    case 'missing_commit':
      return { sentence: 'Fix changed since review', action: 'recheck_fix' };
    case 'remote_moved':
      return { sentence: 'Remote moved, refresh and re-open the preview', action: 'refresh' };
    case 'no_branch':
      return { sentence: 'This session has no branch to push', action: null };
    case 'no_target':
      return { sentence: 'Materialize the project first', action: null };
    default: {
      const never: never = blocker;
      return { sentence: never, action: null };
    }
  }
};
