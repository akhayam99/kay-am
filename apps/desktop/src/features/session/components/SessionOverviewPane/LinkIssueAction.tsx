import { useState } from 'react';
import { ChevronLeft, Link2, Plus } from 'lucide-react';
import { AnchoredPopover, IconButton, Tooltip, cn, useDropdown } from '@goodboy/ui';
import type { Session, SessionExternalTaskProvider } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { useGithubConnection } from '../../../integrations/github/useGithubConnection';
import { IntegrationGlyph } from '../../../integrations/components/IntegrationGlyph';
import { LinkIssueForm } from '../SessionWorkspace/parts/IntegrationPane/LinkIssueForm';
import { VITAL_CHIP } from './vitalChip';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Tracker = {
  readonly provider: Exclude<SessionExternalTaskProvider, 'sentry' | 'bitbucket' | 'slack'>;
  readonly label: string;
};

const INTEGRATION_TRACKERS: ReadonlyArray<Tracker> = [
  { provider: 'linear', label: 'Linear' },
  { provider: 'jira', label: 'Jira' },
  { provider: 'gitlab', label: 'GitLab' },
];

const CHIP_TRIGGER = cn(VITAL_CHIP, 'border-dashed border-border bg-transparent');

type Props = {
  readonly session: Session;
  readonly presentation?: 'icon' | 'chip';
  readonly isCollapsed?: boolean;
};

export const LinkIssueAction = ({ session, presentation = 'icon', isCollapsed = false }: Props) => {
  const integrations = useAppStore(
    (s) => s.workspaceIntegrations[session.workspaceId] ?? EMPTY_ARRAY,
  );
  const github = useGithubConnection({ workspaceId: session.workspaceId });
  const [pickedTracker, setPickedTracker] = useState<Tracker | null>(null);
  const dropdown = useDropdown({
    align: 'end',
    expectedHeight: 280,
    expectedWidth: 384,
    width: 'w-96 max-w-[calc(100vw-2rem)]',
  });

  const connected: ReadonlyArray<Tracker> = [
    ...INTEGRATION_TRACKERS.filter(({ provider }) =>
      integrations.some((integration) => integration.provider === provider),
    ),
    ...(github.isAuthenticated ? [{ provider: 'github', label: 'GitHub' } as const] : []),
  ];
  const tracker = pickedTracker ?? (connected.length === 1 ? (connected[0] ?? null) : null);

  const onToggle = () => {
    setPickedTracker(null);
    dropdown.toggle();
  };
  const onLinked = () => {
    setPickedTracker(null);
    dropdown.close();
  };

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel="Link an issue"
      className="p-3"
      trigger={
        presentation === 'chip' ? (
          <Tooltip content="Link an issue">
            <button
              type="button"
              aria-label="Link an issue"
              onClick={onToggle}
              className={cn(CHIP_TRIGGER, isCollapsed && 'w-6 justify-center px-0')}
            >
              <Plus size={11} aria-hidden />
              {isCollapsed ? null : 'Link an issue'}
            </button>
          </Tooltip>
        ) : (
          <IconButton
            variant="ghost"
            icon={Link2}
            iconSize={ICON_SIZE.row}
            label="Link an issue"
            aria-haspopup="dialog"
            aria-expanded={dropdown.open}
            onClick={onToggle}
            className="size-6 shrink-0"
          />
        )
      }
    >
      {connected.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tracker connected yet. Connect Linear, Jira, GitLab or GitHub from the integrations
          studios in the footer, then link issues here.
        </p>
      ) : tracker != null ? (
        <div className="flex flex-col gap-2">
          {connected.length > 1 ? (
            <button
              type="button"
              onClick={() => setPickedTracker(null)}
              className="flex items-center gap-1 self-start text-xs text-muted-foreground motion-safe:transition-colors hover:text-foreground"
            >
              <ChevronLeft size={ICON_SIZE.row} aria-hidden />
              All trackers
            </button>
          ) : null}
          <LinkIssueForm
            sessionId={session.id}
            workspaceId={session.workspaceId}
            provider={tracker.provider}
            providerLabel={tracker.label}
            nounPhrase="an issue"
            nounPlural="issues"
            onLinked={onLinked}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {connected.map((candidate) => (
            <button
              key={candidate.provider}
              type="button"
              onClick={() => setPickedTracker(candidate)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground motion-safe:transition-colors hover:bg-muted/60"
            >
              <IntegrationGlyph provider={candidate.provider} size="xs" />
              {candidate.label}
            </button>
          ))}
        </div>
      )}
    </AnchoredPopover>
  );
};
