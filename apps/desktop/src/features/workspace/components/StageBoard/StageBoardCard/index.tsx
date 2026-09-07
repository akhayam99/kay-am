import { memo, useEffect, useMemo } from 'react';
import { Archive, ChevronRight, Code, MessageSquareDiff, RotateCcw, Trash2 } from 'lucide-react';
import { Chip, cn, formatUsd, Tooltip } from '@goodboy/ui';
import type { Session, SessionId } from '@goodboy/types';
import {
  EMPTY_ARRAY,
  useAppStore,
  useNonResolverStandaloneAgents,
  useSessionCost,
  useSessionPrFetchState,
  useSessionStageInfo,
} from '../../../../../store';
import { isPrReviewSession } from '../../../../../store/slices/session-view';
import { CostBadge } from '../../../../providers/components/CostBadge';
import { ExternalTaskChip } from '../../../../integrations/components/ExternalTaskChip';
import { CardAction, CardActionSlot } from '@goodboy/ui';
import {
  CONCEPT_ICONS,
  CONCEPT_TONE,
  ICON_SIZE,
} from '../../../../../shared/components/conceptIcons';
import { InlineMarkdown } from '../../../../../shared/components/InlineMarkdown';
import { sessionCardShell } from '../../../../session/components/sessionCardShell';
import { formatRelativeAge } from '../../../../../shared/utils/relativeDate';
import { useOpenSession } from '../../../../../shared/hooks/useOpenSession';
import type { BoardNavigation } from '../useBoardNavigation';
import { getLinkedRequest } from './getLinkedRequest';
import { PrRequestSlot } from './PrRequestSlot';
import { useDynamicActions, type DynamicAction } from './useDynamicActions';

const SESSION_CARD_REVEAL =
  'group-hover/session-card:opacity-100 group-focus-within/session-card:opacity-100';

const SESSION_CARD_META_HIDE =
  'group-hover/session-card:opacity-0 group-focus-within/session-card:opacity-0';

const isUrgent = ({ tone }: { readonly tone: DynamicAction['tone'] }): boolean =>
  tone === 'warning' || tone === 'danger';

type CardSelectionEvent = {
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
};

type StageBoardCardProps = {
  readonly session: Session;
  readonly nav: BoardNavigation;
  readonly archived?: boolean;
  readonly selected?: boolean;
  readonly onModifierClick?: (id: SessionId, event: CardSelectionEvent) => void;
  readonly onArchive?: (session: Session) => void;
  readonly onDelete?: (session: Session) => void;
  readonly onRestore?: (session: Session) => void;
};

export const StageBoardCard = memo(function StageBoardCard({
  session,
  nav,
  archived,
  selected,
  onModifierClick,
  onArchive,
  onDelete,
  onRestore,
}: StageBoardCardProps) {
  const id = session.id as SessionId;
  const { stage, reason } = useSessionStageInfo(session);
  const isAutoMode =
    stage === 'running' && session.workflowRuns.some((r) => r.autoRun && !r.discardedAt);

  const pullRequest = useAppStore((s) => s.sessionGithub[id]?.pr ?? null);
  const prFetchState = useSessionPrFetchState(id);
  const mergeRequest = useAppStore((s) => s.sessionGitlabMr[id]?.mr ?? null);
  const externalTasks = useAppStore((s) => s.sessionExternalTasks[id] ?? EMPTY_ARRAY);
  const agentCount = useNonResolverStandaloneAgents(id).length;
  const agentCountLabel = `${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`;
  const worktreePath = useAppStore((s) => s.sessionWorktrees[id]?.[0] ?? null);
  const mounts = useAppStore((s) => s.sessionProjectMounts?.[id] ?? EMPTY_ARRAY);
  const workspaceProjectCount = useAppStore(
    (s) =>
      (s.projects ?? EMPTY_ARRAY).filter((project) => project.workspaceId === session.workspaceId)
        .length,
  );
  const showProjectChips = workspaceProjectCount > 1 && mounts.length > 0;
  const dynamicActions = useDynamicActions(session, nav, stage);
  const sessionCost = useSessionCost(id);
  const phaseRuns = useAppStore((s) => s.sessionPhaseRuns[id] ?? EMPTY_ARRAY);
  const isPrReview = useMemo(() => isPrReviewSession({ agents: phaseRuns }), [phaseRuns]);
  const reviewDrafts = useAppStore((s) => s.reviewDrafts[id]);
  const loadReviewDrafts = useAppStore((s) => s.loadReviewDrafts);
  const openSession = useOpenSession();

  useEffect(() => {
    if (!isPrReview || reviewDrafts != null) {
      return;
    }
    void loadReviewDrafts(id);
  }, [isPrReview, reviewDrafts, loadReviewDrafts, id]);

  const reviewDraftCount = isPrReview
    ? (reviewDrafts ?? []).filter((draft) => draft.status === 'draft').length
    : 0;

  const age = formatRelativeAge({ fromIso: session.updatedAt });
  const [visibleAction, ...revealedActions] = dynamicActions;
  const linkedRequest = getLinkedRequest({ pullRequest, mergeRequest });
  const isGitlab = mergeRequest != null && pullRequest == null;

  const handlePrClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mergeRequest != null && pullRequest == null) {
      window.dispatchEvent(
        new CustomEvent('goodboy:open-inbox', {
          detail: {
            provider: 'gitlab',
            kind: 'mr',
            recordKey: `gitlab:mr:${mergeRequest.id}`,
          },
        }),
      );
      return;
    }
    nav.openGithub(session);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-archived={archived || undefined}
      data-select-id={id}
      aria-pressed={selected === true}
      aria-keyshortcuts="Alt+Enter"
      onClick={(event) => {
        if (onModifierClick && (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)) {
          onModifierClick(id, event);
          return;
        }
        nav.selectCard(session);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        if (onModifierClick && event.altKey) {
          onModifierClick(id, event);
          return;
        }
        nav.selectCard(session);
      }}
      className={cn(
        'group/session-card grid h-28 shrink-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 p-3 text-left',
        sessionCardShell({ stage, selected }),
      )}
    >
      <span className="flex min-w-0 flex-col justify-between">
        <span className="flex min-h-10 items-start gap-2">
          <PrRequestSlot
            linkedRequest={linkedRequest}
            isGitlab={isGitlab}
            prFetchState={prFetchState}
            onOpen={handlePrClick}
          />
          <InlineMarkdown
            text={session.goal}
            className="line-clamp-2 min-h-10 min-w-0 flex-1 text-sm font-medium leading-5"
          />
        </span>

        {reason && <span className="truncate text-2xs text-muted-foreground">{reason}</span>}
      </span>

      <span className="col-start-2 row-start-1 flex items-center gap-1 self-start">
        <CardActionSlot label="Session quick actions">
          {!archived &&
            revealedActions.map((action) => (
              <CardAction
                key={action.key}
                icon={action.icon}
                tone={action.tone}
                highlighted={isUrgent({ tone: action.tone })}
                label={action.label}
                onClick={action.onClick}
                reveal
                revealGroup={SESSION_CARD_REVEAL}
              />
            ))}
          {!archived && (
            <CardAction
              icon={Code}
              label="Open in editor"
              onClick={() => nav.openIDE(session)}
              disabled={worktreePath == null}
              reveal
              revealGroup={SESSION_CARD_REVEAL}
            />
          )}
          {!archived && (
            <CardAction
              icon={CONCEPT_ICONS.terminal}
              label="Open terminal"
              onClick={() => nav.openTerminal(session)}
              reveal
              revealGroup={SESSION_CARD_REVEAL}
            />
          )}
          {!archived && visibleAction !== undefined && (
            <CardAction
              key={visibleAction.key}
              icon={visibleAction.icon}
              tone={visibleAction.tone}
              highlighted={isUrgent({ tone: visibleAction.tone })}
              label={visibleAction.label}
              onClick={visibleAction.onClick}
            />
          )}
          {archived === true && (
            <CardAction
              icon={RotateCcw}
              tone="primary"
              label="Restore"
              onClick={() => onRestore?.(session)}
            />
          )}
        </CardActionSlot>
        <ChevronRight
          size={ICON_SIZE.row}
          aria-hidden
          className="shrink-0 text-muted-foreground/40 group-hover/session-card:text-muted-foreground/70"
        />
      </span>

      <span className="col-span-2 col-start-1 row-start-2 flex h-5 min-w-0 items-center gap-2">
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          {agentCount > 0 && (
            <Tooltip content={agentCountLabel} side="top">
              <span
                aria-label={agentCountLabel}
                className="inline-flex shrink-0 items-center gap-1 text-3xs tabular-nums text-muted-foreground/70"
              >
                <CONCEPT_ICONS.agents size={ICON_SIZE.row} aria-hidden />
                <span>{agentCount}</span>
              </span>
            </Tooltip>
          )}
          {reviewDraftCount > 0 && (
            <Chip
              tone="draft"
              size="xs"
              bordered={false}
              ariaLabel={`Review ${reviewDraftCount} draft ${reviewDraftCount === 1 ? 'comment' : 'comments'}`}
              onClick={(event) => {
                event.stopPropagation();
                openSession({ sessionId: id, lens: 'review' });
              }}
              icon={<MessageSquareDiff size={10} aria-hidden />}
              label={<span className="tabular-nums">{reviewDraftCount}</span>}
              trailing={<span>draft {reviewDraftCount === 1 ? 'comment' : 'comments'}</span>}
              className="shrink-0"
            />
          )}
          {isAutoMode && (
            <Tooltip content="Autorun" side="top">
              <Chip
                tone={CONCEPT_TONE.autorun}
                size="xs"
                bordered={false}
                ariaLabel="Autorun"
                icon={<CONCEPT_ICONS.autorun size={ICON_SIZE.row} aria-hidden />}
                className="shrink-0"
              />
            </Tooltip>
          )}
          {showProjectChips
            ? mounts.map((mount) => (
                <Chip
                  key={mount.projectId}
                  tone="neutral"
                  size="xs"
                  bordered={false}
                  label={<span className="truncate">{mount.mountName}</span>}
                  className="min-w-0"
                />
              ))
            : null}
          {externalTasks.map((task) => (
            <ExternalTaskChip
              key={`${task.provider}:${task.externalId}`}
              task={task}
              variant="icon"
            />
          ))}
        </span>
        <span
          className={cn(
            'ml-auto flex shrink-0 items-center gap-2 motion-safe:transition-opacity',
            SESSION_CARD_META_HIDE,
          )}
        >
          {sessionCost > 0 && (
            <CostBadge
              value={sessionCost}
              title={`Session spend: ${formatUsd(sessionCost)} (excludes summarizer)`}
              className="shrink-0 text-3xs tabular-nums text-muted-foreground/70"
            />
          )}
          {age && (
            <span className="shrink-0 text-3xs tabular-nums text-muted-foreground/70">{age}</span>
          )}
        </span>
      </span>

      <CardActionSlot
        label="Session lifecycle actions"
        className="col-start-2 row-start-2 h-5 self-center justify-self-end"
      >
        {!archived && (
          <CardAction
            icon={Archive}
            label="Archive"
            onClick={() => onArchive?.(session)}
            reveal
            revealGroup={SESSION_CARD_REVEAL}
          />
        )}
        <CardAction
          icon={Trash2}
          tone="danger"
          label="Delete"
          onClick={() => onDelete?.(session)}
          reveal
          revealGroup={SESSION_CARD_REVEAL}
        />
      </CardActionSlot>
    </div>
  );
});
