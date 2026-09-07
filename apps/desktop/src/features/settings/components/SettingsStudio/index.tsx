import { useEffect, useState } from 'react';
import { ScrollFade, StudioRailLayout } from '@goodboy/ui';
import type { Workspace } from '@goodboy/types';
import { ToolSettingsScope } from '../../../integrations/components/ToolSettingsScope';
import { ProviderSettingsScope } from '../../../providers/components/ProviderStudio';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../shared/components/conceptIcons';
import { StudioShell } from '../../../../shared/components/StudioShell';
import { AppScopePanel } from './AppScopePanel';
import { SettingsRail } from './SettingsRail';
import type { SettingsFocus, SettingsScope } from './types';
import { WorkspaceScopePanel } from './WorkspaceScopePanel';

type Props = {
  readonly currentWorkspace: Workspace | null;
  readonly initialFocus: SettingsFocus;
  readonly onClose: () => void;
};

export const SettingsStudio = ({ currentWorkspace, initialFocus, onClose }: Props) => {
  const [scope, setScope] = useState<SettingsScope>(initialFocus.scope);

  useEffect(() => setScope(initialFocus.scope), [initialFocus]);

  const availableScope = currentWorkspace === null && scope !== 'app' ? 'app' : scope;

  return (
    <StudioShell
      icon={CONCEPT_ICONS.settings}
      tone={CONCEPT_TONE.settings}
      title="Settings"
      workspaceName={currentWorkspace?.name ?? 'App settings'}
      closeLabel="close settings"
      onClose={onClose}
    >
      {(requestClose) => (
        <StudioRailLayout
          railLabel="Settings scopes"
          railWidth="narrow"
          rail={
            <ScrollFade className="min-h-0 flex-1" fadeFrom="background">
              <SettingsRail
                scope={availableScope}
                workspaceName={currentWorkspace?.name ?? null}
                onSelect={setScope}
              />
            </ScrollFade>
          }
          detail={
            availableScope === 'app' ? (
              <AppScopePanel initialSection={initialFocus.section} requestClose={requestClose} />
            ) : availableScope === 'workspace' && currentWorkspace !== null ? (
              <WorkspaceScopePanel
                workspaceId={currentWorkspace.id}
                initialSection={initialFocus.section}
                requestClose={requestClose}
              />
            ) : availableScope === 'providers' && currentWorkspace !== null ? (
              <ProviderSettingsScope
                workspaceId={currentWorkspace.id}
                initialFocus={initialFocus.provider}
                initialAction={initialFocus.action}
              />
            ) : availableScope === 'tools' && currentWorkspace !== null ? (
              <ToolSettingsScope
                key={currentWorkspace.id}
                workspaceId={currentWorkspace.id}
                initialFocus={initialFocus.tool}
              />
            ) : null
          }
        />
      )}
    </StudioShell>
  );
};
