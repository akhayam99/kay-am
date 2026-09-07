import type { WorkspaceId } from '@goodboy/types';
import { FORM_BODIES } from './formBodies';
import { IntegrationConnectPanel } from './components/IntegrationConnectPanel';

type Provider = 'linear' | 'sentry' | 'gitlab' | 'jira' | 'bitbucket' | 'slack';

type Props = {
  readonly provider: Provider;
  readonly workspaceId: WorkspaceId;
  readonly compact?: boolean;
  readonly shouldAutoFocus?: boolean;
  readonly wrapped?: boolean;
};

const PROVIDER_DESCRIPTIONS: Record<Provider, string> = {
  linear: 'Connect Linear to review issues from this project',
  sentry: 'Connect Sentry to review errors from this project',
  gitlab: 'Connect GitLab to review merge requests from this project',
  jira: 'Connect Jira to review issues from this project',
  bitbucket: 'Connect Bitbucket to review pull requests from this project',
  slack: 'Connect Slack to read the threads a task came out of',
};

export const ConnectIntegrationEmptyState = ({
  provider,
  workspaceId,
  compact = false,
  shouldAutoFocus = false,
  wrapped = true,
}: Props) => {
  const FormBody = FORM_BODIES[provider];
  const panel = (
    <IntegrationConnectPanel
      provider={provider}
      description={PROVIDER_DESCRIPTIONS[provider]}
      headingLevel={compact ? undefined : 2}
    >
      <FormBody workspaceId={workspaceId} shouldAutoFocus={shouldAutoFocus} />
    </IntegrationConnectPanel>
  );

  if (!wrapped) {
    return panel;
  }

  return (
    <div className={compact ? 'flex justify-center py-5' : 'flex justify-center'}>{panel}</div>
  );
};
