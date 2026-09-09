import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronRight, Plus } from 'lucide-react';
import {
  Button,
  CountToggle,
  Eyebrow,
  FilledEmptyState,
  KbdPill,
  PANE_RHYTHM,
  cn,
  ScrollArea,
} from '@goodboy/ui';
import type {
  Session,
  SessionGroupKey,
  SessionId,
  SessionStage,
  WorkspaceId,
} from '@goodboy/types';
import { useSessionViewPrefs, useSortedGroupedSessions } from '../../../../store';
import { SESSION_STAGE_META, STAGE_TONE } from '../../../../features/session/session-stage';
import { useMultiSelect } from '../../../../shared/hooks/useMultiSelect';
import { useDragLasso } from '../../../../shared/hooks/useDragLasso';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { BulkActionBar } from '../BulkActionBar';
import { useSidebarPeekHold } from '../SidebarPeekOverlay/hold';
import { SessionViewMenu } from './SessionViewMenu';
import { shortcutGlyphs } from '../../../../shared/keyboard/registry';
import { ProjectFilter } from '../ProjectFilter';
import { SessionActivityItem } from './SessionActivityItem';

type ActivityTab = 'active' | 'archived';

const PR_GROUP_LABELS: Record<string, string> = {
  'not-open': 'no PR',
  draft: 'draft',
  reviewable: 'in review',
  reviewed: 'approved',
  closed: 'closed',
  merged: 'merged',
};

const COLLAPSED_BY_DEFAULT: ReadonlyArray<string> = ['done', 'merged', 'closed'];

type GroupLabelParams = {
  readonly key: string;
  readonly groupMode: SessionGroupKey;
};

const groupLabel = ({ key, groupMode }: GroupLabelParams): string => {
  if (groupMode === 'stage') {
    return SESSION_STAGE_META[key as SessionStage]?.label ?? key;
  }
  if (groupMode === 'pr') {
    return PR_GROUP_LABELS[key] ?? key;
  }
  return key;
};

type GroupKeyParams = {
  readonly key: string;
};

type Props = {
  workspaceId: WorkspaceId;
  sessions: ReadonlyArray<Session>;
  archivedSessions: ReadonlyArray<Session>;
  currentSessionId: SessionId | null;
  onSelectSession: (id: SessionId) => void;
  onArchivedTabOpen?: () => void;
};

export const SessionActivityBar = ({
  workspaceId,
  sessions,
  archivedSessions,
  currentSessionId,
  onSelectSession,
  onArchivedTabOpen,
}: Props) => {
  const [tab, setTab] = useState<ActivityTab>('active');

  useEffect(() => {
    const onNewSessionRequest = () => {
      setTab('active');
    };
    window.addEventListener('goodboy:new-session', onNewSessionRequest);
    return () => window.removeEventListener('goodboy:new-session', onNewSessionRequest);
  }, []);
  const [expandedOverrides, setExpandedOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );

  const prefs = useSessionViewPrefs(workspaceId);
  const filterSessions = useMemo(
    () => [...sessions, ...archivedSessions],
    [archivedSessions, sessions],
  );

  const groupedActive = useSortedGroupedSessions(workspaceId, sessions);
  const groupedArchived = useSortedGroupedSessions(workspaceId, archivedSessions);

  const displayGroups = tab === 'active' ? groupedActive : groupedArchived;
  const visibleGroups = useMemo(
    () => displayGroups.filter((group) => group.sessions.length > 0),
    [displayGroups],
  );
  const isGrouped = prefs.group !== 'none';
  const isArchivedView = tab === 'archived';
  const totalVisible = visibleGroups.reduce((count, group) => count + group.sessions.length, 0);

  const visibleOrder = useMemo(
    () =>
      visibleGroups.flatMap((group) => group.sessions.map((session) => session.id as SessionId)),
    [visibleGroups],
  );
  const selection = useMultiSelect(visibleOrder);
  const { clear: clearSelection, isSelected } = selection;

  const visibleSessions = isArchivedView ? archivedSessions : sessions;
  const selectedSessions = useMemo(
    () => visibleSessions.filter((s) => isSelected(s.id as SessionId)),
    [visibleSessions, isSelected],
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const { selectIds } = selection;
  const onLassoSelect = useCallback(
    (ids: ReadonlyArray<SessionId>, mode: 'replace' | 'add') => selectIds(ids, mode),
    [selectIds],
  );
  const lasso = useDragLasso<SessionId>({
    containerRef: listRef,
    onSelect: onLassoSelect,
    requireAlt: true,
  });

  useEffect(() => {
    clearSelection();
  }, [tab, clearSelection]);

  const { hold, release } = useSidebarPeekHold();
  const hasSelection = selectedSessions.length > 0;
  useEffect(() => {
    if (!hasSelection) {
      return;
    }
    hold();
    return () => release();
  }, [hasSelection, hold, release]);

  const isCollapsed = ({ key }: GroupKeyParams): boolean =>
    expandedOverrides.get(key) ?? COLLAPSED_BY_DEFAULT.includes(key);

  const toggleGroup = ({ key }: GroupKeyParams): void => {
    setExpandedOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !isCollapsed({ key }));
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col gap-2">
      <div className="flex shrink-0 flex-col gap-2 px-2 py-2">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <Eyebrow label="Sessions" />
          <div className="flex items-center gap-0.5">
            <ProjectFilter workspaceId={workspaceId} sessions={filterSessions} />
            <CountToggle
              label="archived"
              count={archivedSessions.length}
              icon={Archive}
              isShown={isArchivedView}
              onChange={(isShown) => {
                if (isShown) {
                  onArchivedTabOpen?.();
                }
                setTab(isShown ? 'archived' : 'active');
              }}
            />
            <SessionViewMenu workspaceId={workspaceId} />
          </div>
        </div>

        {!isArchivedView ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.dispatchEvent(new CustomEvent('goodboy:new-session'))}
            aria-label="Create new session"
            className="group relative w-full justify-center gap-1.5 px-2 text-xs"
          >
            <Plus size={ICON_SIZE.row} aria-hidden />
            New
            <KbdPill
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 h-4 min-w-4 -translate-y-1/2 px-1 text-3xs opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {shortcutGlyphs('session.new')}
            </KbdPill>
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={listRef}
          onPointerDown={lasso.onPointerDown}
          className={cn('relative flex flex-col gap-4', PANE_RHYTHM.sessionList.pad)}
        >
          {visibleGroups.map((group) => {
            const isGroupCollapsed = isGrouped && isCollapsed({ key: group.key });
            const stageTone =
              prefs.group === 'stage' ? STAGE_TONE[group.key as SessionStage] : undefined;
            return (
              <div key={group.key} className="flex flex-col gap-2">
                {isGrouped ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup({ key: group.key })}
                    aria-expanded={!isGroupCollapsed}
                    className="group flex w-full items-center gap-2 rounded px-0.5 text-left"
                  >
                    <ChevronRight
                      size={ICON_SIZE.row}
                      aria-hidden
                      className={cn(
                        'shrink-0 text-muted-foreground/40 motion-safe:transition-transform group-hover:text-muted-foreground',
                        !isGroupCollapsed && 'rotate-90',
                      )}
                    />
                    <Eyebrow
                      label={groupLabel({ key: group.key, groupMode: prefs.group })}
                      tone={stageTone ?? 'neutral'}
                    />
                    {group.sessions.length > 0 ? (
                      <span aria-hidden className="text-2xs tabular-nums text-muted-foreground/60">
                        {group.sessions.length}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                {!isGroupCollapsed ? (
                  <div className="flex flex-col gap-2">
                    {group.sessions.map((session) => (
                      <SessionActivityItem
                        key={session.id}
                        session={session}
                        isActive={session.id === currentSessionId}
                        isDimmed={isArchivedView}
                        isSelected={isSelected(session.id as SessionId)}
                        onModifierClick={selection.handleItemClick}
                        onClick={() => onSelectSession(session.id as SessionId)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {lasso.rect != null ? (
            <div
              aria-hidden
              style={{
                left: lasso.rect.left,
                top: lasso.rect.top,
                width: lasso.rect.width,
                height: lasso.rect.height,
              }}
              className="pointer-events-none absolute z-10 rounded-sm border border-primary/60 bg-primary/10"
            />
          ) : null}

          {totalVisible === 0 ? (
            <FilledEmptyState
              icon={CONCEPT_ICONS.sessions}
              tone={CONCEPT_TONE.sessions}
              title={isArchivedView ? 'No archived sessions' : 'No sessions yet'}
            />
          ) : null}
        </div>
      </ScrollArea>

      {selectedSessions.length > 0 ? (
        <div className="shrink-0 p-2">
          <BulkActionBar
            scope={isArchivedView ? 'archived' : 'active'}
            sessions={selectedSessions}
            onSelectAll={selection.selectAll}
            onClear={clearSelection}
          />
        </div>
      ) : null}
    </div>
  );
};
