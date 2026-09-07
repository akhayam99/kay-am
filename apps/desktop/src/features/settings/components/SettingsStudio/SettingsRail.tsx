import { PANE_RHYTHM, SelectableRow } from '@goodboy/ui';
import { Boxes, Settings, Wrench } from 'lucide-react';
import type { SettingsScope } from './types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly scope: SettingsScope;
  readonly workspaceName: string | null;
  readonly onSelect: (scope: SettingsScope) => void;
};

const ITEMS = [
  { scope: 'app', label: 'App', icon: Settings },
  { scope: 'workspace', label: 'Workspace', icon: Wrench },
  { scope: 'providers', label: 'Providers & models', icon: Boxes },
  { scope: 'tools', label: 'Tools', icon: CONCEPT_ICONS.integrations },
] satisfies ReadonlyArray<{ scope: SettingsScope; label: string; icon: typeof Settings }>;

export const SettingsRail = ({ scope, workspaceName, onSelect }: Props) => (
  <nav aria-label="Settings scopes" className={`flex flex-col gap-1 ${PANE_RHYTHM.navRail.body}`}>
    {ITEMS.map((item) => {
      const Icon = item.icon;
      const subtitle = item.scope === 'workspace' ? workspaceName : null;
      return (
        <SelectableRow
          key={item.scope}
          selected={scope === item.scope}
          ariaCurrent={scope === item.scope}
          onClick={() => onSelect(item.scope)}
          className={`items-center gap-2.5 ${PANE_RHYTHM.navRail.row}`}
        >
          <Icon size={ICON_SIZE.control} aria-hidden className="shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{item.label}</span>
            {subtitle === null ? null : (
              <span className="truncate text-2xs text-muted-foreground">{subtitle}</span>
            )}
          </span>
        </SelectableRow>
      );
    })}
  </nav>
);
