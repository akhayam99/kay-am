import { ArrowRight, Plus } from 'lucide-react';
import { Button, cn } from '@goodboy/ui';
import { DogMascot } from '../../../../shared/components/DogMascot';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

export type CreateAgentTriggerVariant = 'tile' | 'compact';

const TILE_CLASS =
  'group flex items-center gap-2.5 rounded-lg border border-border-soft bg-elevated px-3 py-2.5 text-left text-foreground motion-safe:transition-colors hover:border-border';

type Props = {
  readonly variant: CreateAgentTriggerVariant;
  readonly isOpen: boolean;
  readonly className?: string;
  readonly description?: string;
  readonly onClick: () => void;
};

export const CreateAgentTrigger = ({ variant, isOpen, className, description, onClick }: Props) => {
  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn('min-w-0', className)}
      >
        <Plus size={ICON_SIZE.row} aria-hidden className="shrink-0" />
        <span className="truncate">Create agent</span>
      </Button>
    );
  }

  if (description == null) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(TILE_CLASS, className)}
      >
        <DogMascot size={ICON_SIZE.control} className="shrink-0 text-success" />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">Create agent</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      className={cn(TILE_CLASS, className)}
    >
      <DogMascot size={ICON_SIZE.hero} className="shrink-0 text-success" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="text-sm font-medium text-foreground">Create agent</span>
        <span className="truncate text-2xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight
        size={ICON_SIZE.control}
        aria-hidden
        className="shrink-0 text-muted-foreground/30 motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
      />
    </button>
  );
};
