import { Eyebrow, SelectableRow, StatusDot } from '@goodboy/ui';
import type { IntegrationBinding } from '@goodboy/types';
import { FOOTER_INTEGRATIONS } from '../../../../app/components/AppFooter/categories';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';
import {
  IntegrationGlyph,
  integrationLabel,
  type IntegrationGlyphProvider,
} from '../IntegrationGlyph';
import { toolIdentity } from './toolIdentity';

type Props = {
  readonly focusedId: IntegrationGlyphProvider | null;
  readonly onSelect: (tool: IntegrationGlyphProvider) => void;
  readonly integrations: ReadonlyArray<IntegrationBinding>;
  readonly connected: Record<IntegrationGlyphProvider, boolean>;
  readonly githubIdentity: string | null;
};

export const ToolsRail = ({
  focusedId,
  onSelect,
  integrations,
  connected,
  githubIdentity,
}: Props) => (
  <div className="flex flex-col gap-4 p-2">
    <section className="flex flex-col gap-1">
      <Eyebrow label="Tools" className="px-2.5" />
      <div className="flex flex-col gap-0.5">
        {FOOTER_INTEGRATIONS.map(({ provider }) => {
          const isActive = provider === focusedId;
          const subtitle = !connected[provider]
            ? 'not connected'
            : provider === 'github'
              ? (githubIdentity ?? 'connected')
              : toolIdentity({
                  binding: integrations.find((binding) => binding.provider === provider),
                });
          return (
            <SelectableRow
              key={provider}
              selected={isActive}
              ariaCurrent={isActive}
              onClick={() => onSelect(provider)}
              className="items-center gap-2.5 px-2.5 py-2"
            >
              <span aria-hidden className="shrink-0">
                <IntegrationGlyph provider={provider} size={ICON_SIZE.control} useBrandColor />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {integrationLabel({ provider })}
                </span>
                <span className="truncate text-2xs text-muted-foreground">{subtitle}</span>
              </span>
              <StatusDot tone={connected[provider] ? 'success' : 'neutral'} size="md" />
            </SelectableRow>
          );
        })}
      </div>
    </section>
  </div>
);
