import type { ComponentType } from 'react';
import type { WorkspaceId } from '@goodboy/types';
import type { IntegrationGlyphProvider } from './components/IntegrationGlyph';
import { BitbucketFormBody } from './bitbucket/BitbucketFormBody';
import { GitlabFormBody } from './gitlab/GitlabFormBody';
import { JiraFormBody } from './jira/JiraFormBody';
import { LinearFormBody } from './linear/LinearFormBody';
import { SentryFormBody } from './sentry/SentryFormBody';
import { SlackFormBody } from './slack/SlackFormBody';

type FormBodyProps = {
  readonly workspaceId: WorkspaceId;
  readonly shouldAutoFocus?: boolean;
};

export const FORM_BODIES: Record<
  Exclude<IntegrationGlyphProvider, 'github'>,
  ComponentType<FormBodyProps>
> = {
  linear: LinearFormBody,
  sentry: SentryFormBody,
  gitlab: GitlabFormBody,
  jira: JiraFormBody,
  bitbucket: BitbucketFormBody,
  slack: SlackFormBody,
};
