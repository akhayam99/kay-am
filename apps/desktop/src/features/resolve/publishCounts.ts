import type { ResolvePublicationPreview, ResolveQueueItemWithThread } from '@goodboy/types';
import type { PublishCounts } from './resolvePublishCopy';

const isLocalNote = ({ entry }: { readonly entry: ResolveQueueItemWithThread }): boolean =>
  entry.thread.originKind === 'diff_comment';

export const acceptedPublishCounts = ({
  entries,
}: {
  readonly entries: ReadonlyArray<ResolveQueueItemWithThread>;
}): PublishCounts => {
  const decided = entries.filter(
    ({ item, thread }) =>
      (item.approvalState === 'accepted' || item.approvalState === 'wont_fix') &&
      item.deliveredAt === null &&
      item.approvedRevision === thread.revision,
  );
  const commits = new Set(
    decided.flatMap(({ item, thread }) =>
      item.approvalState === 'accepted'
        ? [
            ...(thread.disposition === 'fix' ? (thread.commitShas ?? []) : []),
            ...(item.integratedSha === null ? [] : [item.integratedSha]),
          ]
        : [],
    ),
  );
  return {
    commits: commits.size,
    replies: decided.filter((entry) => !isLocalNote({ entry })).length,
    notes: decided.filter((entry) => isLocalNote({ entry })).length,
  };
};

export const previewPublishCounts = ({
  preview,
}: {
  readonly preview: ResolvePublicationPreview;
}): PublishCounts => ({
  commits: preview.commits.length,
  replies: preview.replies.length,
  notes: preview.notes.length,
});
