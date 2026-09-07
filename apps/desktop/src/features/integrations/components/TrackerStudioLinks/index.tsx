import { openToolSettings } from '../../openToolSettings';
import { Tooltip } from '@goodboy/ui';
import { IntegrationGlyph } from '../IntegrationGlyph';

export type TrackerProvider = 'linear' | 'github' | 'gitlab' | 'jira' | 'sentry';

export type TrackerStudioLink = {
  readonly provider: TrackerProvider;
  readonly label: string;
  readonly issueExternalId?: string;
};

export const TRACKER_STUDIO_LINKS: ReadonlyArray<TrackerStudioLink> = [
  { provider: 'linear', label: 'Linear' },
  { provider: 'github', label: 'GitHub' },
  { provider: 'gitlab', label: 'GitLab' },
  { provider: 'jira', label: 'Jira' },
  { provider: 'sentry', label: 'Sentry' },
];

const INBOX_KIND: Record<TrackerProvider, 'issue' | 'error'> = {
  linear: 'issue',
  github: 'issue',
  gitlab: 'issue',
  jira: 'issue',
  sentry: 'error',
};

type OpenTrackerStudioParams = {
  readonly provider: TrackerProvider;
  readonly issueExternalId?: string;
};

const openTrackerStudio = ({ provider, issueExternalId }: OpenTrackerStudioParams): void => {
  window.dispatchEvent(
    new CustomEvent('goodboy:open-inbox', {
      detail: {
        provider,
        kind: INBOX_KIND[provider],
        recordKey:
          issueExternalId === undefined
            ? undefined
            : `${provider}:${INBOX_KIND[provider]}:${issueExternalId}`,
      },
    }),
  );
};

type Props = {
  readonly connected: Readonly<Record<TrackerProvider, boolean>>;
  readonly links: ReadonlyArray<TrackerStudioLink>;
};

export const TrackerStudioLinks = ({ links, connected }: Props) => {
  return (
    <div className="flex items-center gap-1">
      {links.map((link) => {
        const label = connected[link.provider]
          ? `Open ${link.label} in the inbox`
          : `Connect ${link.label}`;
        return (
          <Tooltip key={link.provider} content={label}>
            <button
              type="button"
              aria-label={label}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground motion-safe:transition-colors hover:bg-muted/60"
              onClick={() => {
                if (!connected[link.provider]) {
                  openToolSettings({ tool: link.provider });
                  return;
                }
                openTrackerStudio({
                  provider: link.provider,
                  issueExternalId: link.issueExternalId,
                });
              }}
            >
              <IntegrationGlyph provider={link.provider} size="xs" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};
