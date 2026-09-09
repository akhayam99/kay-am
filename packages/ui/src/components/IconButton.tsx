import type { ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';
import { tintClasses, type Tone } from '../tint';
import { Tooltip } from './Tooltip';

export type IconButtonProps = Omit<ComponentProps<'button'>, 'type' | 'children' | 'title'> & {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  iconSize?: number;
  busy?: boolean;
  tone?: Tone;
  variant?: 'outline' | 'ghost';
  type?: 'button' | 'submit' | 'reset';
};

const toneClasses = (tone: Tone): string => {
  const tint = tintClasses(tone);
  return cn(tint.borderSoft, tint.text, tint.hoverBorder, tint.hoverBg);
};

export const IconButton = ({
  icon: Icon,
  label,
  tooltip,
  iconSize = 13,
  busy = false,
  tone = 'neutral',
  variant = 'outline',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) => {
  return (
    <Tooltip content={tooltip ?? label}>
      <button
        type={type}
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center rounded-md p-1.5',
          'text-muted-foreground motion-safe:transition-colors',
          variant === 'outline'
            ? 'border border-border-soft hover:border-border hover:bg-muted/50'
            : 'border border-transparent hover:bg-muted/60',
          'hover:text-foreground disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
          tone !== 'neutral' && toneClasses(tone),
          busy && 'animate-border-pulse',
          className,
        )}
        {...rest}
      >
        <Icon size={iconSize} aria-hidden />
      </button>
    </Tooltip>
  );
};
