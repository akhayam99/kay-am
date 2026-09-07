import { Button, StatusDot } from '@goodboy/ui';
import type { WorkspaceId } from '@goodboy/types';
import type { GithubConnection } from '../../github/useGithubConnection';
import { GithubFormBody } from '../../github/GithubFormBody';

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly connection: GithubConnection;
};

export const GithubToolConnection = ({ workspaceId, connection }: Props) => {
  return (
    <section className="flex flex-col gap-4">
      {!connection.isScoped ? (
        <p className="flex items-center gap-2 text-sm">
          <StatusDot tone={connection.isAuthenticated ? 'success' : 'neutral'} size="md" />
          {connection.isAuthenticated
            ? `Connected as ${connection.user ?? '(unknown user)'} via ${connection.mode === 'gh-cli' ? 'the system gh CLI' : 'the global GitHub key'}`
            : connection.isResolved
              ? 'GitHub is not connected'
              : 'Checking GitHub connection'}
        </p>
      ) : null}
      {!connection.isAuthenticated ? (
        <p className="text-sm text-muted-foreground">
          Use a personal API key below, or run <code>gh auth login</code> in a terminal and check
          the connection again.
        </p>
      ) : null}
      {!connection.isAuthenticated || connection.isScoped ? (
        <GithubFormBody
          workspaceId={workspaceId}
          connection={connection}
          shouldAutoFocus={!connection.isAuthenticated}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={connection.refresh}>
          Check connection
        </Button>
      </div>
    </section>
  );
};
