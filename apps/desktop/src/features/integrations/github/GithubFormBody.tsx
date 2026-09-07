import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { GhTokenStatus, WorkspaceId } from '@goodboy/types';
import { ghClearToken, ghSetToken, ghStatus } from '../../github/github';
import { ConnectForm } from '../components/ConnectForm';
import { IntegrationConnectedRow } from '../components/IntegrationConnectedRow';
import { notifyGithubConnectionChanged, type useGithubConnection } from './useGithubConnection';

type Props = {
  workspaceId: WorkspaceId;
  connection?: ReturnType<typeof useGithubConnection>;
  onConnected?: () => void;
  shouldAutoFocus?: boolean;
};

const TOKEN_CREATE_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=Goodboy';
const TOKEN_LIST_URL = 'https://github.com/settings/tokens';

export const GithubFormBody = ({
  workspaceId,
  onConnected,
  shouldAutoFocus = false,
  connection,
}: Props) => {
  const [localStatus, setStatus] = useState<GhTokenStatus | null>(null);

  const status = connection === undefined ? localStatus : connection.status;
  const refreshConnection = connection?.refresh;

  const refresh = useCallback(async () => {
    if (refreshConnection !== undefined) {
      return;
    }
    try {
      setStatus(await ghStatus(workspaceId));
    } catch {
      setStatus(null);
    }
  }, [workspaceId, refreshConnection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (status?.scoped === true) {
    return (
      <IntegrationConnectedRow
        provider="github"
        primary={`Connected as ${status.user ?? '(unknown user)'}`}
        badge="workspace key"
        disconnectDescription="Deletes this workspace's GitHub personal API key from your keychain. This does not sign you out of the system gh CLI."
        onDisconnect={async () => {
          await ghClearToken(workspaceId);
          await refresh();
          notifyGithubConnectionChanged();
        }}
      />
    );
  }

  return (
    <ConnectForm
      tokenId="github-pat"
      tokenLabel="Personal API key"
      tokenPlaceholder="ghp_…"
      tokenLink={{ label: 'Get a personal access token from GitHub', href: TOKEN_CREATE_URL }}
      guide={
        status?.user != null ? (
          <p className="text-2xs leading-relaxed text-muted-foreground">
            Already covered by your system gh CLI, connected as {status.user}. A key pasted here
            overrides it for this workspace only.
          </p>
        ) : null
      }
      note={{
        label: 'Scope and where your key goes',
        body: (
          <>
            The repo scope is enough;{' '}
            <a
              href={TOKEN_LIST_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
            >
              configure SSO <ExternalLink size={10} aria-hidden />
            </a>{' '}
            if your org requires it. The key is stored encrypted in your operating system keychain
            and sent directly to GitHub over HTTPS; it never touches Goodboy&apos;s own servers.
          </>
        ),
      }}
      shouldAutoFocus={shouldAutoFocus}
      onSubmit={async ({ token }) => {
        await ghSetToken(token, workspaceId);
        await refresh();
        notifyGithubConnectionChanged();
        onConnected?.();
      }}
    />
  );
};
