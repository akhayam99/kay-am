import { cn, type OverflowMenuItem } from '@goodboy/ui';

type Props = {
  readonly items: ReadonlyArray<OverflowMenuItem>;
  readonly onClose: () => void;
};

export const EditorMenuContent = ({ items, onClose }: Props) => (
  <>
    {items.map((item) => {
      if (item.kind === 'separator') {
        return <div key={item.key} aria-hidden className="h-px bg-border-soft" />;
      }
      if (item.kind === 'header') {
        return (
          <div
            key={item.key}
            className="px-2.5 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70"
          >
            {item.label}
          </div>
        );
      }
      if (item.kind === 'empty') {
        return (
          <div key={item.key} className="px-2.5 py-1.5 italic text-muted-foreground/50">
            {item.label}
          </div>
        );
      }
      const Icon = item.icon;
      return (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled === true) {
              return;
            }
            item.onClick();
            onClose();
          }}
          className={cn(
            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left motion-safe:transition-colors',
            item.disabled === true
              ? 'cursor-not-allowed text-muted-foreground'
              : item.destructive === true
                ? 'text-danger/90 hover:bg-danger/10 hover:text-danger'
                : 'text-foreground/80 hover:bg-muted hover:text-foreground',
          )}
        >
          {Icon != null ? (
            <Icon size={11} aria-hidden className="shrink-0 text-muted-foreground/70" />
          ) : null}
          <span className="flex-1 truncate">{item.label}</span>
          {item.hint != null && item.hint !== '' ? (
            <kbd className="font-mono text-2xs text-muted-foreground/60">{item.hint}</kbd>
          ) : null}
        </button>
      );
    })}
  </>
);
