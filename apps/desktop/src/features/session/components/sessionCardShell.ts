import { cn } from '@goodboy/ui';
import type { SessionStage } from '@goodboy/types';

type Params = {
  readonly stage: SessionStage;
  readonly selected?: boolean;
  readonly active?: boolean;
  readonly dimmed?: boolean;
};

type RestBorderParams = Pick<Params, 'stage' | 'selected'>;

const restBorder = ({ stage, selected }: RestBorderParams): string => {
  if (selected === true) {
    return 'border-primary bg-primary/5';
  }
  if (stage === 'running') {
    return 'border-info/50 spin-border spin-border-info';
  }
  if (stage === 'attention') {
    return 'border-warning/50';
  }
  return 'border-border-soft hover:border-border';
};

export const sessionCardShell = ({ stage, selected, active, dimmed }: Params): string =>
  cn(
    'rounded-lg border bg-elevated text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
    active === true ? 'border-border shadow-sm' : restBorder({ stage, selected }),
    dimmed === true && 'opacity-50',
  );
