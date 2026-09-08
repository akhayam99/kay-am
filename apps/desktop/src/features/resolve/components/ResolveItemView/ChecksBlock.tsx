import { Button, Chip, cn } from '@goodboy/ui';
import type { ResolveChecksSummary } from '../../checkReceipts';
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
  readonly onRunCheck: () => void;
};

export const ChecksBlock = ({ checks, canRunCheck, isRunning, onRunCheck }: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
      {RESOLVE_ITEM_LABEL.checks}
    </p>
    <p className="text-xs text-foreground">{checksHeadline({ verdict: checks.verdict })}</p>
    {checks.isScoped && <p className="text-2xs text-muted-foreground/70">{scopedRunNote}</p>}
    {checks.receipts.length > 0 && (
      <ul className="flex flex-col gap-1">
        {checks.receipts.map((receipt) => (
          <li
            key={receipt.run.id}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 font-mono text-2xs',
              receipt.isStale
                ? 'border-border-soft text-muted-foreground/70'
                : 'border-border-soft bg-muted/20 text-foreground/80',
            )}
          >
            <Chip
              size="3xs"
              bordered={false}
              tone={
                receipt.isStale
                  ? 'neutral'
                  : receipt.run.outcome === 'passed'
                    ? 'success'
                    : 'danger'
              }
              label={
                receipt.isStale ? RESOLVE_ITEM_LABEL.stale : RESOLVE_ITEM_LABEL.machineVerified
              }
            />
            <span className="min-w-0 flex-1 truncate">
              {receiptLine({
                tree: receipt.tree,
                command: receipt.run.command,
                testIdentity: receipt.run.testIdentity,
                durationMs: receipt.run.durationMs,
              })}
            </span>
            <span className="shrink-0 tabular-nums">exit {receipt.run.exitCode}</span>
          </li>
        ))}
      </ul>
    )}
    {canRunCheck && (
      <div>
        <Button size="sm" variant="ghost" disabled={isRunning} onClick={onRunCheck}>
          {RESOLVE_ITEM_LABEL.runOnCurrentCode}
        </Button>
      </div>
    )}
  </div>
);
