import type {
  PublicationBlocker,
  ResolvePublicationDrift,
  ResolvePublicationPreview,
} from '@goodboy/types';

export type PublishCounts = Readonly<{
  commits: number;
  replies: number;
  notes: number;
}>;

const plural = ({
  count,
  one,
  many,
}: {
  readonly count: number;
  readonly one: string;
  readonly many: string;
}): string => `${count} ${count === 1 ? one : many}`;

export const publishButtonLabel = ({ counts }: { readonly counts: PublishCounts }): string => {
  if (counts.commits > 0 && counts.replies > 0) {
    return `Push ${counts.commits}, reply ${counts.replies}`;
  }
  if (counts.commits > 0) {
    return `Push ${counts.commits}`;
  }
  if (counts.replies > 0) {
    return `Reply ${counts.replies}`;
  }
  return counts.notes > 0 ? `Mark ${counts.notes} done` : 'Nothing to push';
};

export const frozenAtLabel = ({ frozenAt }: { readonly frozenAt: number }): string =>
  `as of ${new Date(frozenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

export const commitsLine = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null =>
  preview.commits.length === 0
    ? null
    : `Push ${plural({ count: preview.commits.length, one: 'commit', many: 'commits' })} to ${preview.branch}`;

export const repliesLine = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null =>
  preview.replies.length === 0
    ? null
    : `Post ${plural({ count: preview.replies.length, one: 'reply', many: 'replies' })}`;

export const notesLine = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null =>
  preview.notes.length === 0
    ? null
    : `Mark ${plural({ count: preview.notes.length, one: 'local note', many: 'local notes' })} done`;

export const heldBackNote = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null => {
  const held = preview.drift.filter((entry) => entry.threadId !== null);
  if (held.length === 0) {
    return null;
  }
  const reason =
    held[0]?.kind === 'approval_withdrawn' ? 'you took the approval back' : 'the comment changed';
  return `${held.length} held back, ${reason}`;
};

export const excludedLine = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): string | null => {
  const count = preview.excluded.length;
  if (count === 0) {
    return null;
  }
  return `${plural({ count, one: 'comment', many: 'comments' })} ${count === 1 ? 'needs' : 'need'} you first`;
};

export const UPDATE_AND_REVIEW = 'Update branch and review again';
export const CHECK_AND_RETRY = 'Check and retry';

export const driftSentence = ({
  drift,
}: {
  readonly drift: ReadonlyArray<ResolvePublicationDrift>;
}): string | null => {
  const branch = drift.find((entry) => entry.kind === 'branch_moved');
  if (branch !== undefined) {
    return `The branch moved from ${branch.before} to ${branch.after}`;
  }
  const remote = drift.find((entry) => entry.kind === 'remote_moved');
  if (remote !== undefined) {
    return `The remote moved from ${remote.before} to ${remote.after}`;
  }
  return drift.length === 0 ? null : 'Something changed while you were looking';
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
    case 'unapproved_commit':
      return { sentence: 'The branch carries a commit you did not approve', action: 'view_work' };
    case 'dirty_tree':
      return { sentence: 'Worktree has uncommitted changes', action: 'open_diff' };
    case 'writer_busy':
      return { sentence: 'A fix is still running on this worktree', action: 'view_work' };
    case 'publication_in_progress':
      return { sentence: `Another push is already running for #${prNumber}`, action: null };
    case 'missing_commit':
      return { sentence: 'Fix changed since review', action: 'recheck_fix' };
    case 'remote_moved':
      return { sentence: 'The remote moved', action: 'refresh' };
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
