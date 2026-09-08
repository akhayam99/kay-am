import { Button } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import { inlineChangePlan } from '../../inlineChangePlan';
import { RESOLVE_ITEM_LABEL, changeSummaryLine, hiddenFilesLine } from '../../resolveItemCopy';
import { CompactDiff } from './CompactDiff';

type Props = {
  readonly files: ReadonlyArray<FileDiff>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onOpenInDiff: () => void;
};

export const ChangeBlock = ({ files, isLoading, error, onOpenInDiff }: Props) => {
  const plan = inlineChangePlan({ files });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
          {RESOLVE_ITEM_LABEL.change}
        </p>
        <Button size="sm" variant="ghost" onClick={onOpenInDiff}>
          {RESOLVE_ITEM_LABEL.openInDiff}
        </Button>
      </div>
      {isLoading && <p className="text-2xs text-muted-foreground">Reading the change.</p>}
      {error !== null && <p className="text-2xs text-warning">{error}</p>}
      {!isLoading && error === null && files.length === 0 && (
        <p className="text-2xs text-muted-foreground">This proposal carries no captured change.</p>
      )}
      {files.length > 0 && (
        <>
          <p className="text-2xs text-muted-foreground">
            {changeSummaryLine({ fileCount: files.length, changedLines: plan.changedLines })}
          </p>
          {plan.files.map((file) => (
            <CompactDiff key={file.path} file={file} />
          ))}
          {plan.hiddenFileCount > 0 && (
            <p className="text-2xs text-muted-foreground/70">
              {hiddenFilesLine({ count: plan.hiddenFileCount })}
            </p>
          )}
        </>
      )}
    </div>
  );
};
