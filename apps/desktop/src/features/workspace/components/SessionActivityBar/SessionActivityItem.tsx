import { useMemo } from 'react';
import { CostBadge } from '../../../../features/providers/components/CostBadge';
import { pullRequestMeta } from '../../../../features/github/components/PullRequestChip';
import { EMPTY_ARRAY, useAppStore, useSessionCost, useSessionStageInfo } from '../../../../store';
import type { Session, SessionId } from '@goodboy/types';
import { PANE_RHYTHM, StatusDot, TERMINAL_DIM, cn, formatUsd } from '@goodboy/ui';
import { InlineMarkdown } from '../../../../shared/components/InlineMarkdown';
import { stripInlineMarkdown } from '../../../../shared/components/InlineMarkdown/stripInlineMarkdown';
import { formatRelativeAge } from '../../../../shared/utils/relativeDate';
import { STAGE_TONE } from '../../../../features/session/session-stage';

type SelectionClickEvent = {
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
};

type Props = {
  readonly session: Session;
  readonly isActive: boolean;
  readonly isDimmed?: boolean;
  readonly isSelected?: boolean;
  readonly onModifierClick: (id: SessionId, event: SelectionClickEvent) => void;
  readonly onClick: () => void;
};

export const SessionActivityItem = ({
  session,
  isActive,
  isDimmed = false,
  isSelected = false,
  onModifierClick,
  onClick,
}: Props) => {
  const { stage, reason } = useSessionStageInfo(session);
  const prState = useAppStore(
    (state) => state.sessionGithub[session.id as SessionId]?.pr?.state ?? null,
  );
  const prMeta = prState != null ? pullRequestMeta({ state: prState }) : null;
  const externalTasks = useAppStore(
    (state) => state.sessionExternalTasks[session.id as SessionId] ?? EMPTY_ARRAY,
  );
  const sessionCost = useSessionCost(session.id as SessionId);
  const age = formatRelativeAge({ fromIso: session.updatedAt });
  const plainGoal = useMemo(() => stripInlineMarkdown({ text: session.goal }), [session.goal]);

  return (
    <button
      type="button"
      data-select-id={session.id}
      aria-pressed={isSelected}
      aria-keyshortcuts="Alt+Enter"
      onClick={(event) => {
        if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) {
          onModifierClick(session.id as SessionId, event);
          return;
        }
        onClick();
      }}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'Enter' && event.key !== ' ')) {
          return;
        }
        event.preventDefault();
        onModifierClick(session.id as SessionId, event);
      }}
      title={`${plainGoal} · ${reason}${prMeta != null ? ` · PR ${prMeta.label}` : ''}${externalTasks.length > 0 ? ` · ${externalTasks.map((task) => task.identifier).join(', ')}` : ''}`}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md text-left motion-safe:transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
        PANE_RHYTHM.navRail.row,
        isActive && 'bg-muted font-medium text-foreground',
        isSelected && 'bg-primary/10 ring-1 ring-primary/30',
        isDimmed && TERMINAL_DIM,
      )}
    >
      <span className="inline-flex h-5 shrink-0 items-center">
        <StatusDot tone={STAGE_TONE[stage]} size="sm" pulsing={stage === 'running'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <InlineMarkdown
          text={session.goal}
          className="min-w-0 truncate text-sm font-medium leading-5 text-foreground"
        />
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{reason}</span>
          {sessionCost > 0 ? (
            <CostBadge
              value={sessionCost}
              title={`Session spend: ${formatUsd(sessionCost)} (excludes summarizer)`}
              className="shrink-0 font-sans text-3xs font-medium tabular-nums text-muted-foreground/70"
            />
          ) : null}
          {age !== '' ? (
            <span className="shrink-0 text-3xs tabular-nums text-muted-foreground/70">{age}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
};
