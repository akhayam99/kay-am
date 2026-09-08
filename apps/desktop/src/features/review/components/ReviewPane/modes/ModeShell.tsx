import type { ReactNode } from 'react';
import { Divider, Eyebrow, PANE_RHYTHM, ScrollFade, cn } from '@goodboy/ui';
import { BackToQueueButton } from './BackToQueueButton';

type Props = {
  readonly label: string;
  readonly onBack: (() => void) | null;
  readonly actions?: ReactNode;
  readonly measure?: 'reading' | 'pane' | 'full';
  readonly children: ReactNode;
};

export const ModeShell = ({ label, onBack, actions, measure = 'reading', children }: Props) => (
  <section aria-label={label} className="flex min-h-0 flex-1 flex-col">
    <div
      className={cn('flex shrink-0 items-center justify-between gap-2', PANE_RHYTHM.rail.header)}
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBack !== null && <BackToQueueButton onClick={onBack} />}
        <Eyebrow label={label} muted />
      </div>
      {actions}
    </div>
    <Divider />
    <ScrollFade className="min-h-0 flex-1">
      <div className={cn('flex flex-col gap-6', PANE_RHYTHM.body, PANE_RHYTHM.measure[measure])}>
        {children}
      </div>
    </ScrollFade>
  </section>
);
