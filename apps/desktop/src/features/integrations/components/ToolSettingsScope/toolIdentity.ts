import type { IntegrationBinding } from '@goodboy/types';

type Params = {
  readonly binding: IntegrationBinding | undefined;
};

export const toolIdentity = ({ binding }: Params): string => {
  if (binding === undefined) {
    return 'not connected';
  }
  switch (binding.provider) {
    case 'linear':
      return `${binding.config.viewerName} · ${binding.config.workspaceUrlKey}`;
    case 'gitlab':
      return `${binding.config.userName} · ${binding.config.host}`;
    case 'bitbucket':
      return binding.config.workspaceName ?? binding.config.workspaceSlug;
    case 'jira':
      return `${binding.config.siteUrl} (${binding.config.projectKey})`;
    case 'sentry':
      return `${binding.config.org}/${binding.config.projectName ?? binding.config.project}`;
    case 'slack':
      return binding.config.teamName;
    case 'github':
      return 'connected';
    default: {
      const unreachable: never = binding;
      return unreachable;
    }
  }
};
