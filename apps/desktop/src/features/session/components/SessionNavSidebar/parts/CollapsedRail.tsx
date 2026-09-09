import { useCallback } from 'react';
import { Kanban, PanelLeft, Plus } from 'lucide-react';
import { Tooltip, cn, tintClasses } from '@goodboy/ui';
import { useAppStore } from '../../../../../store';
import { shortcutGlyphs } from '../../../../../shared/keyboard/registry';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly onExpand: () => void;
};

const railButton = (isActive: boolean): string =>
  cn(
    'flex size-8 shrink-0 items-center justify-center rounded-md motion-safe:transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
    isActive
      ? cn(tintClasses('primary').bg, tintClasses('primary').text)
      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
  );

export const CollapsedRail = ({ onExpand }: Props) => {
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);

  const onBoard = useCallback(() => {
    void setCurrentSession(null);
  }, [setCurrentSession]);

  return (
    <div className="flex h-full w-11 min-w-0 flex-col items-center gap-1 py-2">
      <Tooltip content={`Show session sidebar (${shortcutGlyphs('column.toggle')})`} side="right">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Show session sidebar (${shortcutGlyphs('column.toggle')})`}
          className={railButton(false)}
        >
          <PanelLeft size={ICON_SIZE.control} aria-hidden />
        </button>
      </Tooltip>
      <Tooltip content={`Back to board (${shortcutGlyphs('session.board')})`} side="right">
        <button
          type="button"
          onClick={onBoard}
          aria-label={`Back to board (${shortcutGlyphs('session.board')})`}
          className={railButton(false)}
        >
          <Kanban size={ICON_SIZE.control} aria-hidden />
        </button>
      </Tooltip>
      <Tooltip content={`New session (${shortcutGlyphs('session.new')})`} side="right">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('goodboy:new-session'))}
          aria-label={`New session (${shortcutGlyphs('session.new')})`}
          className={railButton(false)}
        >
          <Plus size={ICON_SIZE.control} aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
};
