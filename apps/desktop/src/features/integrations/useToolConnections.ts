import type { IntegrationBinding, WorkspaceId } from '@goodboy/types';
import { useAppStore } from '../../store';
import type { IntegrationGlyphProvider } from './components/IntegrationGlyph';
import { useGithubConnection } from './github/useGithubConnection';

type Params = {
  readonly workspaceId: WorkspaceId | null;
};

const NO_INTEGRATIONS: ReadonlyArray<IntegrationBinding> = [];

export const useToolConnections = ({ workspaceId }: Params) => {
  const integrations = useAppStore((state) =>
    workspaceId === null
      ? NO_INTEGRATIONS
      : (state.workspaceIntegrations[workspaceId] ?? NO_INTEGRATIONS),
  );
  const github = useGithubConnection({ workspaceId });
  const connected: Record<IntegrationGlyphProvider, boolean> = {
    github: github.isAuthenticated,
    gitlab: integrations.some((binding) => binding.provider === 'gitlab'),
    bitbucket: integrations.some((binding) => binding.provider === 'bitbucket'),
    linear: integrations.some((binding) => binding.provider === 'linear'),
    jira: integrations.some((binding) => binding.provider === 'jira'),
    sentry: integrations.some((binding) => binding.provider === 'sentry'),
    slack: integrations.some((binding) => binding.provider === 'slack'),
  };
  return { integrations, connected, github };
};
