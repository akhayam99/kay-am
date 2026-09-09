import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Plus } from 'lucide-react';
import {
  Button,
  cn,
  Divider,
  EmptyState,
  Eyebrow,
  ScrollFade,
  Skeleton,
  Tooltip,
} from '@goodboy/ui';
import type { Session, SessionId, SessionStage, WorkspaceId } from '@goodboy/types';
import {
  EMPTY_ARRAY,
  useAppStore,
  useProjectFilteredSessions,
  useStageGroupedSessions,
} from '../../../../store';
import { STAGE_ORDER } from '../../../../store/slices/session-view/types';
import { DogMascot } from '../../../../shared/components/DogMascot';
import { PANE_RHYTHM } from '@goodboy/ui';
import { ArchiveSessionConfirm } from '../../../session/components/ArchiveSessionConfirm';
import { DeleteSessionConfirm } from '../../../session/components/DeleteSessionConfirm';
import { BulkActionBar } from '../BulkActionBar';
import { useProjectGitStatuses } from '../../hooks/useProjectGitStatuses';
import { useDragLasso } from '../../../../shared/hooks/useDragLasso';
import { ProjectsStep } from '../../../onboarding/OnboardingWizard/steps/ProjectsStep';
import { StageColumn } from './StageColumn';
import { useBoardNavigation } from './useBoardNavigation';
import { useBoardSelection } from './useBoardSelection';
import { ProjectFilter } from '../ProjectFilter';
import { ProjectGitPills } from '../ProjectGitPill';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Confirm = { readonly kind: 'archive' | 'delete'; readonly session: Session };

const STAGES: ReadonlyArray<SessionStage> = (
  Object.entries(STAGE_ORDER) as Array<[SessionStage, number]>
)
  .sort((a, b) => a[1] - b[1])
  .map(([stage]) => stage);

const SKELETON_COLUMNS = [3, 2, 2, 1, 2];

const BoardSkeleton = () => (
  <div
    className={cn(
      'mx-auto flex min-h-0 w-fit max-w-full flex-1 overflow-x-hidden',
      PANE_RHYTHM.board.colGap,
    )}
    role="status"
    aria-label="Loading board"
  >
    {SKELETON_COLUMNS.map((cards, col) => (
      <div
        key={col}
        className={cn(
          'flex min-h-0 flex-col',
          PANE_RHYTHM.board.colWidth,
          PANE_RHYTHM.board.colStack,
        )}
      >
        <Skeleton className="h-4 w-24 rounded-full" />
        <div className={cn('flex flex-col', PANE_RHYTHM.board.cardGap)}>
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    ))}
  </div>
);

type Props = {
  readonly workspaceId: WorkspaceId;
  readonly sessions: ReadonlyArray<Session>;
};

export const StageBoard = ({ workspaceId, sessions }: Props) => {
  const groups = useStageGroupedSessions(workspaceId, sessions);
  const nav = useBoardNavigation();
  const archivedList = useAppStore((s) => s.archivedSessions[workspaceId]);
  const archived = archivedList ?? EMPTY_ARRAY;
  const filteredArchived = useProjectFilteredSessions({ workspaceId, sessions: archived });
  const filterSessions = useMemo(() => [...sessions, ...archived], [archived, sessions]);
  const boardReady = useAppStore((s) => s.boardReady);
  const loadArchivedSessions = useAppStore((s) => s.loadArchivedSessions);
  const workspace = useAppStore(
    (s) => s.workspaces.find((candidate) => candidate.id === workspaceId) ?? null,
  );
  const workspaceProjects = useAppStore(
    useShallow((s) => s.projects.filter((project) => project.workspaceId === workspaceId)),
  );
  const hasProjects = workspaceProjects.length > 0;
  const projectGitStatuses = useProjectGitStatuses({ workspaceId });
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const onArchive = useCallback((session: Session) => setConfirm({ kind: 'archive', session }), []);
  const onDelete = useCallback((session: Session) => setConfirm({ kind: 'delete', session }), []);

  useEffect(() => {
    void loadArchivedSessions(workspaceId);
  }, [loadArchivedSessions, workspaceId]);

  const byStage = useMemo(() => {
    const map = new Map<string, ReadonlyArray<Session>>();
    for (const group of groups) {
      map.set(group.key, group.sessions);
    }
    return map;
  }, [groups]);

  const activeSessions = useMemo(
    () => STAGES.flatMap((stage) => [...(byStage.get(stage) ?? EMPTY_ARRAY)]),
    [byStage],
  );
  const selection = useBoardSelection({ activeSessions, archivedSessions: filteredArchived });
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const onLassoSelect = useCallback(
    (ids: ReadonlyArray<SessionId>, mode: 'replace' | 'add') => {
      const archivedIds = new Set(filteredArchived.map((session) => session.id as SessionId));
      const inArchived = ids.filter((id) => archivedIds.has(id));
      const inActive = ids.filter((id) => !archivedIds.has(id));
      if (inArchived.length > inActive.length) {
        selection.archived.selectIds(inArchived, mode);
        return;
      }
      selection.active.selectIds(inActive, mode);
    },
    [filteredArchived, selection],
  );
  const lasso = useDragLasso<SessionId>({ containerRef: columnsRef, onSelect: onLassoSelect });

  const empty = sessions.length === 0 && archived.length === 0;
  const pending = !boardReady || (sessions.length === 0 && archivedList === undefined);
  const hasUsableProject =
    workspaceProjects.some((project) => project.kind === 'folder') ||
    projectGitStatuses.some(({ status }) => status?.state === 'ready');
  const areAllRepoProjectsMissing =
    projectGitStatuses.length > 0 &&
    projectGitStatuses.every(({ status }) => status?.state === 'missing');
  const statusesPending = projectGitStatuses.some(({ status }) => status === null);
  const blockedReason = !hasProjects
    ? 'Link a project first'
    : statusesPending
      ? 'Reading git status'
      : areAllRepoProjectsMissing
        ? 'The project folder is unreachable'
        : 'This project needs a git repository with one commit first';

  const newSessionButton = (
    <Button
      size="sm"
      onClick={() => window.dispatchEvent(new CustomEvent('goodboy:new-session'))}
      disabled={!hasUsableProject}
    >
      <Plus size={ICON_SIZE.control} aria-hidden />
      New session
    </Button>
  );

  return (
    <div className={cn('flex h-full w-full', PANE_RHYTHM.stack, PANE_RHYTHM.board.pad)}>
      {pending || !empty || hasProjects ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-4">
            <span className="flex min-w-0 items-baseline gap-2">
              <Eyebrow label="Stage board" />
              {activeSessions.length > 0 && (
                <span className="text-2xs tabular-nums text-muted-foreground/60">
                  {activeSessions.length}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <ProjectGitPills entries={projectGitStatuses} />
              <ProjectFilter workspaceId={workspaceId} sessions={filterSessions} />
              {hasUsableProject ? (
                newSessionButton
              ) : (
                <Tooltip content={blockedReason} side="bottom">
                  {newSessionButton}
                </Tooltip>
              )}
            </span>
          </div>
          <Divider />
        </>
      ) : null}

      {pending && <BoardSkeleton />}

      {!pending && empty && !hasProjects && workspace !== null && (
        <ScrollFade className="min-h-0 flex-1" viewportClassName="flex items-center justify-center">
          <div className="w-full max-w-xl py-6">
            <ProjectsStep workspace={workspace} />
          </div>
        </ScrollFade>
      )}

      {!pending && hasProjects && empty && hasUsableProject && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            illustration={<DogMascot size={72} className="text-primary" />}
            title="Start your first session"
            description="Describe an outcome; an agent picks it up in its own worktree and branch."
            action={
              <Button
                size="md"
                onClick={() => window.dispatchEvent(new CustomEvent('goodboy:new-session'))}
              >
                <Plus size={ICON_SIZE.control} aria-hidden />
                New session
              </Button>
            }
            size="lg"
            headingLevel={2}
            className="max-w-md"
          />
        </div>
      )}

      {!pending && !empty && (
        <ScrollFade orientation="horizontal" fadeSize="w-8" className="min-h-0 flex-1">
          <div
            ref={columnsRef}
            onPointerDown={lasso.onPointerDown}
            className={cn(
              'relative mx-auto flex h-full min-h-0 w-fit max-w-full',
              PANE_RHYTHM.board.colGap,
            )}
          >
            {STAGES.map((stage) => (
              <StageColumn
                key={stage}
                spec={{ kind: 'stage', stage }}
                sessions={byStage.get(stage) ?? EMPTY_ARRAY}
                nav={nav}
                selection={selection.active}
                onArchive={onArchive}
                onDelete={onDelete}
                onRestore={nav.restore}
              />
            ))}
            <StageColumn
              key="archived"
              spec={{ kind: 'archived' }}
              sessions={filteredArchived}
              nav={nav}
              selection={selection.archived}
              onArchive={onArchive}
              onDelete={onDelete}
              onRestore={nav.restore}
            />
            {lasso.rect && (
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
            )}
          </div>
        </ScrollFade>
      )}

      {selection.selectedSessions.length > 0 && (
        <BulkActionBar
          scope={selection.scope}
          sessions={selection.selectedSessions}
          onSelectAll={
            selection.scope === 'archived'
              ? selection.archived.selectAll
              : selection.active.selectAll
          }
          onClear={selection.clearAll}
          className="shrink-0"
        />
      )}

      {confirm?.kind === 'archive' && (
        <ArchiveSessionConfirm
          session={confirm.session}
          onClose={() => setConfirm(null)}
          className="mx-auto w-full max-w-lg shrink-0"
        />
      )}
      {confirm?.kind === 'delete' && (
        <DeleteSessionConfirm
          session={confirm.session}
          onClose={() => setConfirm(null)}
          className="mx-auto w-full max-w-lg shrink-0"
        />
      )}
    </div>
  );
};
