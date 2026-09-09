import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn';

export type Props = {
  readonly label: string;
  readonly count: number;
  readonly isShown: boolean;
  readonly icon: LucideIcon;
  readonly onChange: (isShown: boolean) => void;
};

export const CountToggle = ({ label, count, isShown, icon, onChange }: Props) => {
  if (count === 0) {
    return null;
  }

  const Icon = icon;

  return (
    <button
      type="button"
      onClick={() => onChange(!isShown)}
      aria-pressed={isShown}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md px-1.5 text-2xs font-medium motion-safe:transition-colors',
        isShown
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
      )}
    >
      <Icon size={10} aria-hidden />
      {label} ({count})
    </button>
  );
};
