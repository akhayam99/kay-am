import { openToolSettings } from '../../../features/integrations/openToolSettings';
import { AnchoredPopover, cn, ScrollFade, Tooltip, useDropdown } from '@goodboy/ui';
import { Plus } from 'lucide-react';
import type { IntegrationGlyphProvider } from '../../../features/integrations/components/IntegrationGlyph';
import type { FooterIntegrationEntry } from './categories';
import { IntegrationAddRow } from './IntegrationAddRow';
import { ICON_SIZE } from '../../../shared/components/conceptIcons';

type Props = {
  readonly members: ReadonlyArray<FooterIntegrationEntry>;
  readonly enabled: Record<IntegrationGlyphProvider, boolean>;
  readonly openers: Record<IntegrationGlyphProvider, () => void>;
  readonly isEmpty: boolean;
  readonly active: boolean;
};

type SelectParams = { readonly provider: IntegrationGlyphProvider };

const PANEL_WIDTH = 224;
const PANEL_MAX_HEIGHT = 240;

export const IntegrationAddPopover = ({ members, enabled, openers, isEmpty, active }: Props) => {
  const dropdown = useDropdown({
    align: 'center',
    width: 'w-56',
    expectedWidth: PANEL_WIDTH,
    expectedHeight: PANEL_MAX_HEIGHT,
  });

  const select = ({ provider }: SelectParams) => {
    dropdown.close();
    if (!enabled[provider]) {
      openToolSettings({ tool: provider });
      return;
    }
    openers[provider]();
  };

  const actionLabel = isEmpty ? 'Link your first integration' : 'Link integration';

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel="Integrations"
      className="flex flex-col"
      anchorClassName="shrink-0"
      hasBackdrop
      trigger={
        <Tooltip content={actionLabel}>
          <button
            type="button"
            onClick={dropdown.toggle}
            aria-label={actionLabel}
            aria-expanded={dropdown.open}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <Plus size={ICON_SIZE.row} aria-hidden />
            <span>Link integration</span>
          </button>
        </Tooltip>
      }
    >
      <ScrollFade className="max-h-60 min-h-0 flex-1" viewportClassName="py-1" fadeSize={12}>
        <ul aria-label="Integrations" className="flex flex-col">
          {members.map((member) => (
            <IntegrationAddRow
              key={member.provider}
              member={member}
              connected={enabled[member.provider]}
              onSelect={() => select({ provider: member.provider })}
            />
          ))}
        </ul>
      </ScrollFade>
    </AnchoredPopover>
  );
};
