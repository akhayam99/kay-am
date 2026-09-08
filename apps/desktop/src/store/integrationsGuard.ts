import type { IntegrationBindingProvider } from '@goodboy/types';

export const QUERY_BRIDGE_VERBS: Readonly<
  Record<IntegrationBindingProvider, ReadonlyArray<string>>
> = {
  linear: ['issue', 'issues-assigned', 'comments', 'comment-create', 'issue-update'],
  sentry: ['issues', 'issue', 'issue-detail'],
  github: [
    'prs',
    'pr',
    'pr-for-branch',
    'pr-diff',
    'pr-checks',
    'pr-comments',
    'issues-assigned',
    'issue',
    'issue-comments',
    'pr-comment-create',
    'pr-thread-reply',
    'pr-thread-resolve',
    'pr-ready',
    'pr-merge',
    'issue-comment-create',
    'push',
    'pr-create',
  ],
  gitlab: [
    'issues-assigned',
    'issue',
    'issue-notes',
    'issue-update',
    'issue-note-create',
    'mrs-assigned',
    'mrs',
    'mr-for-branch',
    'mr-diff',
    'mr-discussions',
    'mr-approval-state',
    'mr-note-create',
    'mr-discussion-reply',
    'mr-discussion-resolve',
    'mr-approve',
    'mr-unapprove',
    'mr-merge',
    'mr-create',
  ],
  jira: [
    'issues',
    'issue',
    'comments',
    'transitions',
    'comment-create',
    'issue-update',
    'transition',
  ],
  bitbucket: [
    'prs',
    'pr',
    'pr-diff',
    'pr-comments',
    'pr-statuses',
    'pr-for-branch',
    'pr-comment-create',
    'pr-comment-reply',
    'pr-approve',
    'pr-unapprove',
    'pr-request-changes',
    'pr-unrequest-changes',
    'pr-merge',
    'pr-decline',
  ],
  slack: ['channels', 'thread-heads', 'thread', 'permalink', 'users', 'reply', 'reaction-add'],
};

type GuardParams = {
  readonly providers: ReadonlyArray<IntegrationBindingProvider>;
  readonly isBridgeServing: boolean;
};

export const buildIntegrationsGuard = ({ providers, isBridgeServing }: GuardParams): string => {
  if (!isBridgeServing) {
    return '';
  }
  const known = Array.from(new Set(providers)).filter(
    (provider): provider is IntegrationBindingProvider =>
      Object.prototype.hasOwnProperty.call(QUERY_BRIDGE_VERBS, provider),
  );
  if (known.length === 0) {
    return '';
  }
  const order = Object.keys(QUERY_BRIDGE_VERBS) as ReadonlyArray<IntegrationBindingProvider>;
  const listed = order.filter((provider) => known.includes(provider));
  return [
    '[integrations]',
    'This workspace has live connections you can query by running the Goodboy binary at $GOODBOY_BIN with its `query` subcommand. Goodboy runs the call for you, so there is nothing to authenticate and no MCP server to reach.',
    ...listed.map((provider) => `${provider}: ${QUERY_BRIDGE_VERBS[provider].join(', ')}`),
    'Call it as `"$GOODBOY_BIN" query <provider> <verb> [arguments]`, for example `"$GOODBOY_BIN" query linear issue ENG-123`. Keep the quotes around it: the path can contain spaces.',
    'Run `"$GOODBOY_BIN" query <provider> --help` for the exact arguments of a verb. Output is plain text; add --json for the raw payload.',
    'Prefer it over scraping a web UI, and never invent a verb that is not listed here.',
    '[/integrations]',
  ].join('\n');
};
