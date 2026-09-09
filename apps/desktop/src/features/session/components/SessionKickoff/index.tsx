import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { cn, formatError, Skeleton } from '@goodboy/ui';
import type { IsoDateTime, Session } from '@goodboy/types';
import { useAppStore, useSessionSlots } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { IntegrationGlyph } from '../../../integrations/components/IntegrationGlyph';
import type { IssueCandidate } from '../../../integrations/fetchIssueCandidates';
import {
  TRACKER_STUDIO_LINKS,
  TrackerStudioLinks,
} from '../../../integrations/components/TrackerStudioLinks';
import { CreateAgentPopover } from '../CreateAgentPopover';
import { KickoffTile } from './KickoffTile';
import { useKickoffIssues } from './useKickoffIssues';

type Props = {
  readonly session: Session;
  readonly onOpenWorkflowBuilder: () => void;
};

type PickIssueParams = {
  readonly candidate: IssueCandidate;
};

export const SessionKickoff = ({ session, onOpenWorkflowBuilder }: Props) => {
  const issues = useKickoffIssues({ workspaceId: session.workspaceId });
  const linkSessionExternalTask = useAppStore((state) => state.linkSessionExternalTask);
  const autoTitleSession = useAppStore((state) => state.autoTitleSession);
  const upsertSessionSlot = useAppStore((state) => state.upsertSessionSlot);
  const slots = useSessionSlots(session.id);
  const { showToast } = useToast();
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  const pickIssue = async ({ candidate }: PickIssueParams) => {
    const key = `${candidate.provider}:${candidate.externalId}`;
    setLinkingKey(key);
    try {
      await linkSessionExternalTask(session.id, {
        provider: candidate.provider,
        externalId: candidate.externalId,
        identifier: candidate.identifier,
        title: candidate.title,
        url: candidate.url,
        createdAt: new Date().toISOString() as IsoDateTime,
      });
      const goalSlot = slots.find((slot) => slot.key === 'goal');
      if (goalSlot == null || goalSlot.value.trim() === '') {
        await upsertSessionSlot(session.id, 'goal', candidate.goal);
      }
      await autoTitleSession(session.id, `[${candidate.identifier}] ${candidate.title}`);
      showToast('success', `${candidate.identifier} linked to this session`);
    } catch (cause) {
      showToast('error', formatError(cause));
    } finally {
      setLinkingKey(null);
    }
  };

  const emptyStateLinks = issues.hasSources
    ? TRACKER_STUDIO_LINKS.filter((link) =>
        issues.sources.some((source) => source.provider === link.provider),
      )
    : TRACKER_STUDIO_LINKS;

  return (
    <section aria-label="Kickoff" className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-medium text-foreground">How do you want to start?</h3>
        <p className="text-xs text-muted-foreground">
          Pick a starting point. These suggestions step aside once the first activity lands.
        </p>
      </header>
      <div className="grid gap-2 lg:grid-cols-2">
        <CreateAgentPopover
          sessionId={session.id}
          variant="tile"
          description="Brief a specialist and let it run."
        />
        <KickoffTile
          icon={CONCEPT_ICONS.workflows}
          iconClassName="text-accent"
          title="Add a workflow"
          description="Run a multi-step plan with checkpoints."
          onClick={onOpenWorkflowBuilder}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="px-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Or pick up an issue
        </p>
        {issues.hasSources && issues.isLoaded && issues.rows.length > 0
          ? issues.rows.map((row) => {
              const key = `${row.provider}:${row.externalId}`;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={linkingKey != null}
                  onClick={() => void pickIssue({ candidate: row })}
                  className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left motion-safe:transition-colors hover:bg-muted/60 disabled:opacity-60"
                >
                  <IntegrationGlyph provider={row.provider} size="xs" />
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    {row.identifier}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {row.title}
                  </span>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 text-2xs text-muted-foreground opacity-0 motion-safe:transition-opacity group-hover:opacity-100',
                      linkingKey === key && 'opacity-100',
                    )}
                  >
                    <Link2 size={11} aria-hidden />
                    {linkingKey === key ? 'Linking…' : 'Link to this session'}
                  </span>
                </button>
              );
            })
          : null}
        {issues.hasSources && !issues.isLoaded ? (
          <div role="status" aria-label="Loading issues" className="flex flex-col gap-1 py-0.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="h-3 w-14 shrink-0 rounded" />
                <Skeleton className="h-3 min-w-0 flex-1 rounded" />
              </div>
            ))}
          </div>
        ) : null}
        {!issues.hasSources || (issues.isLoaded && issues.rows.length === 0) ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {issues.hasSources ? 'No open issues detected' : 'No tracker connected yet'}
            </p>
            <div className="shrink-0">
              <TrackerStudioLinks links={emptyStateLinks} connected={issues.connected} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
