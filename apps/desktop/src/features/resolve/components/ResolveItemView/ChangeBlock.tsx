import { Button, SectionHeader, Skeleton } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import { inlineChangePlan } from '../../inlineChangePlan';
import { RESOLVE_ITEM_LABEL, changeSummaryLine } from '../../resolveItemCopy';

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
      <SectionHeader
        label={RESOLVE_ITEM_LABEL.change}
        headingLevel={3}
        action={
          files.length === 0 ? null : (
            <Button size="sm" variant="ghost" onClick={onOpenInDiff}>
              {RESOLVE_ITEM_LABEL.openInDiff}
            </Button>
          )
        }
      />
      {isLoading && <Skeleton className="h-3.5 w-40" />}
      {error !== null && <p className="text-2xs text-warning">{error}</p>}
      {!isLoading && error === null && files.length === 0 && (
        <p className="text-3xs text-muted-foreground">{RESOLVE_ITEM_LABEL.noCapturedChange}</p>
      )}
      {files.length > 0 && (
        <p className="text-3xs tabular-nums text-muted-foreground">
          {changeSummaryLine({ fileCount: files.length, changedLines: plan.changedLines })}
        </p>
      )}
    </div>
  );
};
