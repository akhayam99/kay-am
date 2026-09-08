import { Activity } from 'lucide-react';
import { Button, GhostActionButton, MetaRow, formatUsd } from '@goodboy/ui';
import type { ResolveAttempt } from '@goodboy/types';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';

type Props = {
  readonly attempt: ResolveAttempt;
  readonly costUsd: number | null;
  readonly onStop: () => void;
  readonly onViewWork: () => void;
};

export const RunCard = ({ attempt, costUsd, onStop, onViewWork }: Props) => {
  const isRunning = attempt.phase === 'running' || attempt.phase === 'queued';
  const meta = [
    attempt.model,
    attempt.provider,
    attempt.effort === null ? null : `effort ${attempt.effort}`,
    costUsd === null ? null : formatUsd(costUsd),
  ];
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border-soft px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-2xs text-muted-foreground">
          {isRunning ? 'Working now' : 'Finished run'}
        </span>
        <MetaRow items={meta} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <GhostActionButton icon={Activity} label="View work" onClick={onViewWork} />
        {isRunning && (
          <Button size="sm" variant="ghost" onClick={onStop}>
            {RESOLVE_ITEM_LABEL.stop}
          </Button>
        )}
      </div>
    </div>
  );
};
