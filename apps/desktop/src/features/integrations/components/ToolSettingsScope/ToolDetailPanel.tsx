import { Button, SectionHeader } from '@goodboy/ui';
import type { IntegrationBinding, WorkspaceId } from '@goodboy/types';
import { FOOTER_INTEGRATIONS } from '../../../../app/components/AppFooter/categories';
import { StudioPanel } from '../../../../shared/components/StudioPanel';
import {
  IntegrationGlyph,
  integrationLabel,
  type IntegrationGlyphProvider,
} from '../IntegrationGlyph';
import { FORM_BODIES } from '../../formBodies';
import { toolIdentity } from './toolIdentity';
import type { useGithubConnection } from '../../github/useGithubConnection';
import { GithubToolConnection } from './GithubToolConnection';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly provider: IntegrationGlyphProvider;
  readonly isConnected: boolean;
  readonly binding: IntegrationBinding | undefined;
  readonly github: ReturnType<typeof useGithubConnection>;
};

export const ToolDetailPanel = ({ workspaceId, provider, isConnected, binding, github }: Props) => {
  const FormBody = provider === 'github' ? null : FORM_BODIES[provider];
  const title = integrationLabel({ provider });
  const subtitle = isConnected
    ? provider === 'github'
      ? (github.user ?? 'connected')
      : toolIdentity({ binding })
    : FOOTER_INTEGRATIONS.find((entry) => entry.provider === provider)?.connectLabel;
  return (
    <StudioPanel
      title={title}
      subtitle={subtitle}
      icon={<IntegrationGlyph provider={provider} size={20} />}
    >
      <section className="flex flex-col gap-2">
        <SectionHeader label="Account" />
        {FormBody === null ? (
          <GithubToolConnection workspaceId={workspaceId} connection={github} />
        ) : (
          <FormBody workspaceId={workspaceId} shouldAutoFocus={!isConnected} />
        )}
      </section>
      {isConnected ? (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('goodboy:open-inbox', { detail: { provider } }))
            }
          >
            Open in inbox
          </Button>
        </div>
      ) : null}
    </StudioPanel>
  );
};
