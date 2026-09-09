import { PanelLeftClose, Pin } from 'lucide-react';
import { Eyebrow, IconButton, cn } from '@goodboy/ui';
import { PANE_RHYTHM } from '@goodboy/ui';
import { shortcutGlyphs } from '../../../../../shared/keyboard/registry';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly onCollapse: () => void;
  readonly action?: 'collapse' | 'pin';
};

export const SidebarHeader = ({ onCollapse, action = 'collapse' }: Props) => {
  const label =
    action === 'pin'
      ? `Pin session sidebar (${shortcutGlyphs('column.toggle')})`
      : `Hide session sidebar (${shortcutGlyphs('column.toggle')})`;
  return (
    <div className={cn('flex items-center gap-1', PANE_RHYTHM.navRail.row)}>
      <Eyebrow label="Sessions" className="min-w-0 flex-1 truncate" />
      <IconButton
        variant="ghost"
        icon={action === 'pin' ? Pin : PanelLeftClose}
        iconSize={ICON_SIZE.row}
        label={label}
        onClick={onCollapse}
        className="shrink-0"
      />
    </div>
  );
};
