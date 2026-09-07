import { openToolSettings } from '../../integrations/openToolSettings';
import { Check } from 'lucide-react';
import { cn } from '@goodboy/ui';
import type { OnboardingStepId } from '../onboarding-store';
import { OPEN_COMMAND_PALETTE_EVENT } from '../openCommandPaletteEvent';

type Props = {
  readonly id: OnboardingStepId;
  readonly title: string;
  readonly why: string;
  readonly done: boolean;
};

export const StepRow = ({ id, title, why, done }: Props) => {
  const actionByStep: Partial<Record<OnboardingStepId, () => void>> = {
    workspace: () => window.dispatchEvent(new CustomEvent('goodboy:add-workspace')),
    codeHost: () => openToolSettings({ tool: 'github' }),
    tools: () => openToolSettings({ tool: 'linear' }),
    session: () => window.dispatchEvent(new CustomEvent('goodboy:new-session')),
    palette: () => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT)),
  };
  const action = actionByStep[id];
  const activate = () => action?.();

  return (
    <li title={why} className="rounded-md">
      {done || action === undefined ? (
        <span
          className={cn(
            'flex items-center gap-2 px-1.5 py-1 text-2xs',
            done ? 'text-muted-foreground/60' : 'text-foreground',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border',
              done
                ? 'border-success bg-success/15 text-success'
                : 'border-border-soft bg-transparent',
            )}
          >
            {done ? <Check size={9} aria-hidden /> : null}
          </span>
          <span className={cn('truncate', done && 'line-through decoration-1')}>{title}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={activate}
          title={why}
          aria-label={`Set up ${title}`}
          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-2xs text-foreground motion-safe:transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
          <span
            aria-hidden
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border-soft bg-transparent"
          />
          <span className="truncate">{title}</span>
        </button>
      )}
    </li>
  );
};
