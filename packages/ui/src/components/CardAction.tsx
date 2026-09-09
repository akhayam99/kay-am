import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';
import { tintClasses, type Tone } from '../tint';
import { Tooltip } from './Tooltip';

export type CardActionProps = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tooltip?: string;
  readonly tone?: Tone;
  readonly size?: 'compact' | 'default';
  readonly reveal?: boolean;
  readonly revealGroup?: string;
  readonly highlighted?: boolean;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
};

export const CardAction = ({
  icon: Icon,
  label,
  tooltip,
  tone = 'neutral',
  size = 'compact',
  reveal = false,
  revealGroup = 'group-hover/agent-card:opacity-100 group-focus-within/agent-card:opacity-100',
  highlighted = false,
  pressed,
  expanded,
  disabled = false,
  onClick,
}: CardActionProps) => {
  const isDimmedInPlace = reveal && disabled;
  return (
    <Tooltip
      content={tooltip ?? label}
      side="top"
      anchorClassName={cn('shrink-0', size === 'compact' ? 'size-6' : 'size-7')}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-expanded={expanded}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        className={cn(
          'inline-flex size-full shrink-0 items-center justify-center rounded-md font-medium text-muted-foreground transition-[background-color,color,opacity] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
          size === 'compact' ? 'text-3xs' : 'text-xs',
          tintClasses(tone).hoverBgSoft,
          tintClasses(tone).hoverText,
          reveal ? cn('opacity-0', revealGroup) : disabled && 'opacity-40',
          highlighted && cn(tintClasses(tone).bgSoft, tintClasses(tone).text),
        )}
      >
        <Icon
          size={size === 'compact' ? 12 : 14}
          aria-hidden
          className={cn(isDimmedInPlace && 'opacity-40')}
        />
      </button>
    </Tooltip>
  );
};
