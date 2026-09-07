import { useEffect, useState } from 'react';
import { ScrollFade, StudioRailLayout } from '@goodboy/ui';
import type { WorkspaceId } from '@goodboy/types';
import { FOOTER_INTEGRATIONS } from '../../../../app/components/AppFooter/categories';
import type { IntegrationGlyphProvider } from '../IntegrationGlyph';
import { useToolConnections } from '../../useToolConnections';
import { ToolsRail } from './ToolsRail';
import { ToolDetailPanel } from './ToolDetailPanel';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly initialFocus?: IntegrationGlyphProvider;
};

export const ToolSettingsScope = ({ workspaceId, initialFocus }: Props) => {
  const { integrations, connected, github } = useToolConnections({ workspaceId });
  const [focused, setFocused] = useState<IntegrationGlyphProvider | null>(initialFocus ?? null);
  useEffect(() => setFocused(initialFocus ?? null), [initialFocus]);
  const defaultSelection =
    focused ??
    FOOTER_INTEGRATIONS.find(({ provider }) => !connected[provider])?.provider ??
    FOOTER_INTEGRATIONS[0]?.provider ??
    'github';

  const selected = github.isResolved ? defaultSelection : null;

  useEffect(() => {
    if (focused === null && selected !== null) {
      setFocused(selected);
    }
  }, [focused, selected]);

  return (
    <StudioRailLayout
      railLabel="Tools"
      railWidth="standard"
      rail={
        <ScrollFade className="min-h-0 flex-1" fadeFrom="background">
          <ToolsRail
            focusedId={selected}
            onSelect={setFocused}
            integrations={integrations}
            connected={connected}
            githubIdentity={github.user}
          />
        </ScrollFade>
      }
      detail={
        selected === null ? null : (
          <ToolDetailPanel
            key={selected}
            workspaceId={workspaceId}
            provider={selected}
            isConnected={connected[selected]}
            github={github}
            binding={integrations.find((binding) => binding.provider === selected)}
          />
        )
      }
    />
  );
};
