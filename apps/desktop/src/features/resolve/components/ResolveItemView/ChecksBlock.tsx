import { useState } from 'react';
import { Button, Chip, Collapsible, SectionHeader, cn } from '@goodboy/ui';
import type { Tone } from '@goodboy/ui';
import type { ResolveCheckReceipt, ResolveChecksSummary } from '../../checkReceipts';
import {
  RESOLVE_ITEM_LABEL,
  checksHeadline,
  receiptLine,
  scopedRunNote,
} from '../../resolveItemCopy';

type Props = {
  readonly checks: ResolveChecksSummary;
  readonly canRunCheck: boolean;
  readonly isRunning: boolean;
  readonly note: string | null;
  readonly onRunCheck: () => void;
};

const receiptTone = ({ receipt }: { readonly receipt: ResolveCheckReceipt }): Tone => {
  if (receipt.isStale) {
    return 'neutral';
  }
  return receipt.run.outcome === 'passed' ? 'success' : 'danger';
};

const receiptWord = ({ receipt }: { readonly receipt: ResolveCheckReceipt }): string => {
  if (receipt.isStale) {
    return RESOLVE_ITEM_LABEL.stale;
  }
  return receipt.run.outcome === 'passed' ? RESOLVE_ITEM_LABEL.passed : RESOLVE_ITEM_LABEL.failed;
};

export const ChecksBlock = ({ checks, canRunCheck, isRunning, note, onRunCheck }: Props) => {
  const [areReceiptsShown, setAreReceiptsShown] = useState(false);
  const runCount = checks.receipts.length;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <SectionHeader
        label={RESOLVE_ITEM_LABEL.checks}
        headingLevel={3}
        action={
          canRunCheck ? (
            <Button size="sm" variant="ghost" disabled={isRunning} onClick={onRunCheck}>
              {isRunning ? RESOLVE_ITEM_LABEL.checkRunning : RESOLVE_ITEM_LABEL.runBothTrees}
            </Button>
          ) : null
        }
      />
      <p
        className={cn(
          'rounded-md text-sm text-foreground',
          isRunning && 'spin-border spin-border-info px-2 py-1',
        )}
      >
        {checksHeadline({ verdict: checks.verdict })}
      </p>
      {checks.isScoped && <p className="text-2xs text-muted-foreground">{scopedRunNote}</p>}
      {note !== null && <p className="text-2xs text-warning">{note}</p>}
      {checks.receipts.length > 0 && (
        <Collapsible
          open={areReceiptsShown}
          onOpenChange={setAreReceiptsShown}
          trigger={`Check runs (${runCount})`}
        >
          <ul className="flex flex-col gap-2">
            {checks.receipts.map((receipt) => (
              <li key={receipt.run.id} className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <Chip
                    size="xs"
                    width="sm"
                    bordered={false}
                    tone={receiptTone({ receipt })}
                    label={receiptWord({ receipt })}
                  />
                  <span className="min-w-0 truncate font-mono text-3xs text-foreground">
                    {receipt.run.command}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2 text-3xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {receiptLine({
                      tree: receipt.tree,
                      testIdentity: receipt.run.testIdentity,
                      durationMs: receipt.run.durationMs,
                    })}
                  </span>
                  <span className="shrink-0 tabular-nums">exit {receipt.run.exitCode}</span>
                </span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
};
