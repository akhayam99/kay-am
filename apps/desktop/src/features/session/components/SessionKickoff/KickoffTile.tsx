import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@goodboy/ui';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly icon: LucideIcon;
  readonly iconClassName: string;
  readonly title: string;
  readonly description: string;
  readonly onClick: () => void;
};

export const KickoffTile = ({ icon: Icon, iconClassName, title, description, onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex w-full items-center gap-2.5 rounded-lg border border-border-soft bg-elevated px-3 py-2.5 text-left text-foreground motion-safe:transition-colors hover:border-border"
  >
    <Icon size={ICON_SIZE.hero} aria-hidden className={cn('shrink-0', iconClassName)} />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="truncate text-2xs text-muted-foreground">{description}</span>
    </span>
    <ArrowRight
      size={ICON_SIZE.control}
      aria-hidden
      className="shrink-0 text-muted-foreground/30 motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
    />
  </button>
);
