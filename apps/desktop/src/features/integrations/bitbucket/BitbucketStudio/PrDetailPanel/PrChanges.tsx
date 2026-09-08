import { Divider, EmptyState, Skeleton } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../../shared/components/conceptIcons';
import { ErrorStrip } from '@goodboy/ui';
import { ReviewFileDiff } from '../../../../review/components/ReviewPane/WriteReview/ReviewFileDiff';
import { EMPTY_ARRAY } from '../../../../../store';

type Props = {
  readonly files: ReadonlyArray<FileDiff>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
};

export const PrChanges = ({ files, isLoading, error, onRetry }: Props) => {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading the diff" className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error != null) {
    return <ErrorStrip label="the diff" error={new Error(error)} onRetry={onRetry} />;
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={CONCEPT_ICONS.diff}
        tone={CONCEPT_TONE.diff}
        title="No file changes"
        description="This pull request does not touch any file Goodboy can render."
        size="inline"
        className="py-5"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((file, index) => (
        <div key={file.path} className="flex flex-col gap-2">
          {index > 0 && <Divider />}
          <ReviewFileDiff
            file={file}
            layoutMode="unified"
            drafts={EMPTY_ARRAY}
            onAddDraft={null}
            onAskAgent={null}
          />
        </div>
      ))}
    </div>
  );
};
