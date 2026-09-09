import { Activity, Square } from 'lucide-react';
import { CardAction, CardActionSlot, MetaRow, SectionHeader, cn, formatUsd } from '@goodboy/ui';
import type { ResolveAttempt } from '@goodboy/types';
import { RESOLVE_ITEM_LABEL, attemptPhaseLabel } from '../../resolveItemCopy';

type Props = {
  readonly attempt: ResolveAttempt;
  readonly costUsd: number | null;
  readonly onStop: () => void;
  readonly onViewWork: () => void;
};

const REVEAL_GROUP =
  'group-hover/resolve-run:opacity-100 group-focus-within/resolve-run:opacity-100';

export const RunCard = ({ attempt, costUsd, onStop, onViewWork }: Props) => {
  const isRunning = attempt.phase === 'running';
  return (
    <div className="group/resolve-run flex min-w-0 flex-col gap-2">
      <SectionHeader
        label={RESOLVE_ITEM_LABEL.run}
        headingLevel={3}
        action={
          <CardActionSlot label="Run actions">
            <CardAction
              icon={Activity}
              label={RESOLVE_ITEM_LABEL.viewWork}
              reveal
              revealGroup={REVEAL_GROUP}
              onClick={onViewWork}
            />
            {isRunning && (
              <CardAction icon={Square} label={RESOLVE_ITEM_LABEL.stop} onClick={onStop} />
            )}
          </CardActionSlot>
        }
      />
      <p
        className={cn(
          'w-fit rounded-md text-xs leading-4 text-foreground',
          isRunning && 'spin-border spin-border-info px-2 py-1',
        )}
      >
        {attemptPhaseLabel({ phase: attempt.phase })}
      </p>
      <MetaRow
        className="text-3xs"
        items={[
          <span key="model" className="font-mono">
            {attempt.model}
          </span>,
          attempt.provider,
          attempt.effort === null ? null : `effort ${attempt.effort}`,
          costUsd === null ? null : (
            <span key="cost" className="tabular-nums">
              {formatUsd(costUsd)}
            </span>
          ),
        ]}
      />
    </div>
  );
};
