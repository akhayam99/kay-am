import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Divider,
  ErrorStrip,
  SectionHeader,
  Skeleton,
  Tooltip,
  formatError,
} from '@goodboy/ui';
import type {
  PrCheckRun,
  PrComment,
  ResolveAttempt,
  ResolvePublication,
  ResolveQueueItemWithThread,
  Session,
  SessionId,
} from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { PaneShell } from '../../../../shared/components/PaneShell';
import { useToast } from '../../../../app/components/Toast';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import { EMPTY_RESOLVE_QUEUE_VIEW } from '../../../../store/slices/session-view';
import { InspectorSplit } from '../../../session/components/SessionWorkspace/parts/InspectorSplit';
import { groupThreads } from '../../../github/comment-threads';
import { kindRouting } from '../../../session/agent-kind';
import { startFixAttempt } from '../../../review/startFixAttempt';
import { openReview } from '../../../review/openReview';
import { DEFAULT_AGENT_SPAWN_CONFIG } from '../../../session/components/AgentSpawnConfig/defaultAgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { useResolveDeliveryReceipts } from '../../hooks/useResolveDeliveryReceipts';
import { hasActiveResolveRun } from '../../hasActiveResolveRun';
import { startResolveRun } from '../../startResolveRun';
import {
  buildResolveQueueRows,
  type ResolveQueueRow as QueueRow,
} from '../../buildResolveQueueRows';
import { groupResolveQueue, groupSharedRuns } from '../../groupResolveQueue';
import { orderResolveQueueRows } from '../../orderResolveQueueRows';
import { resolveQueueErrorPlacement } from '../../resolveQueueErrorPlacement';
import {
  RESOLVE_QUEUE_ACTION_LABEL,
  RESOLVE_QUEUE_REFRESH_LABEL,
  RESOLVE_QUEUE_TITLE,
  RESOLVE_RUN_IN_PROGRESS,
  sharedRunHeading,
} from '../../resolveQueueCopy';
import { ResolveSpawnSheet } from '../ResolveSpawnSheet';
import { ResolveItemContainer } from '../ResolveItemView/ResolveItemContainer';
import { QueueFilterChips } from './QueueFilterChips';
import { ResolveQueueRow } from './ResolveQueueRow';
import { ResolveQueueFooter } from './ResolveQueueFooter';
import {
  NoResolveTargetState,
  NothingWaitingState,
  ResolveQueueErrorState,
} from './ResolveQueueEmptyState';

type Props = {
  readonly session: Session;
};

const EMPTY_QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [];
const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];
const EMPTY_PUBLICATIONS: ReadonlyArray<ResolvePublication> = [];
const EMPTY_CHECKS: ReadonlyArray<PrCheckRun> = [];
const SKELETON_ROWS = [0, 1, 2];
const DETAIL_WIDTH = 520;

const scrollableAncestor = (node: HTMLElement | null): HTMLElement | null => {
  let current = node?.parentElement ?? null;
  while (current !== null) {
    if (current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

export const ResolveQueueHome = ({ session }: Props) => {
  const sessionId = session.id as SessionId;
  const listRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();
  const github = useAppStore((s) => s.sessionGithub[sessionId] ?? null);
  const comments = useAppStore(
    (s) =>
      s.sessionGithub[sessionId]?.detail?.comments ?? (EMPTY_ARRAY as ReadonlyArray<PrComment>),
  );
  const checks = useAppStore((s) => s.sessionGithub[sessionId]?.detail?.checks ?? EMPTY_CHECKS);
  const queueItems = useAppStore((s) => s.sessionResolveQueueItems[sessionId] ?? EMPTY_QUEUE_ITEMS);
  const attempts = useAppStore((s) => s.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS);
  const publications = useAppStore(
    (s) => s.sessionResolvePublications[sessionId] ?? EMPTY_PUBLICATIONS,
  );
  const view = useAppStore((s) => s.resolveQueueView[sessionId] ?? EMPTY_RESOLVE_QUEUE_VIEW);
  const loadResolveSession = useAppStore((s) => s.loadResolveSession);
  const deferResolveQueueItem = useAppStore((s) => s.deferResolveQueueItem);
  const takeUpResolveQueueItem = useAppStore((s) => s.takeUpResolveQueueItem);
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const setResolveQueueView = useAppStore((s) => s.setResolveQueueView);
  const openResolveDiff = useAppStore((s) => s.openResolveDiff);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setAgentConfig = useAppStore((s) => s.setAgentConfig);

  const deliveryReceipts = useResolveDeliveryReceipts({ publications });
  const repo = useSessionRepo({ sessionId });
  const roleModels = useSessionRoleModels({ sessionId });
  const [spawnConfig, setSpawnConfig] = useState<AgentSpawnConfigValue>(DEFAULT_AGENT_SPAWN_CONFIG);
  const [isSpawning, setIsSpawning] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);

  useEffect(() => {
    void loadResolveSession({ sessionId });
  }, [loadResolveSession, sessionId]);

  const rows = useMemo(
    () =>
      buildResolveQueueRows({
        entries: queueItems,
        attempts,
        deliveryReceipts,
        comments,
      }),
    [attempts, comments, deliveryReceipts, queueItems],
  );

  const groups = useMemo(() => groupResolveQueue({ rows }), [rows]);
  const listed = useMemo(
    () =>
      orderResolveQueueRows({
        rows: view.filter === 'for_you' ? groups.needsReview : groups.active,
        pinned: view.order,
      }),
    [groups.active, groups.needsReview, view.filter, view.order],
  );
  const listGroups = useMemo(() => groupSharedRuns({ rows: listed }), [listed]);
  const selectedRow = useMemo(
    () => rows.find((row) => row.thread.threadId === view.expandedThreadId) ?? null,
    [rows, view.expandedThreadId],
  );

  useEffect(() => {
    const node = scrollableAncestor(listRef.current);
    if (node === null || view.scrollTop === 0) {
      return;
    }
    node.scrollTop = view.scrollTop;
  }, [view.scrollTop]);

  const threadsByThreadId = useMemo(
    () =>
      new Map(
        groupThreads(comments.filter((comment) => comment.source === 'review')).flatMap((thread) =>
          thread.head.threadId == null ? [] : [[thread.head.threadId, thread] as const],
        ),
      ),
    [comments],
  );

  const onSelect = useCallback(
    (threadId: string | null): void => {
      setResolveQueueView({
        sessionId,
        patch: { expandedThreadId: threadId, order: listed.map((row) => row.thread.threadId) },
      });
    },
    [listed, sessionId, setResolveQueueView],
  );

  const onOpenInDiff = useCallback(
    ({
      threadId,
      sha,
      path,
      line,
    }: {
      readonly threadId: string;
      readonly sha: string;
      readonly path: string | null;
      readonly line: number | null;
    }): void => {
      openResolveDiff({
        sessionId,
        threadId,
        sha,
        path,
        line,
        order: listed.map((row) => row.thread.threadId),
        scrollTop: scrollableAncestor(listRef.current)?.scrollTop ?? 0,
      });
    },
    [listed, openResolveDiff, sessionId],
  );

  const onAskForChanges = useCallback(
    ({ threadId, instruction }: { readonly threadId: string; readonly instruction: string }) => {
      const pr = github?.pr ?? null;
      const thread = threadsByThreadId.get(threadId);
      if (pr === null || thread === undefined || instruction === '') {
        return;
      }
      const routing = kindRouting({ kind: 'resolver', roleModels });
      const row = rows.find((candidate) => candidate.thread.threadId === threadId) ?? null;
      void startFixAttempt({
        sessionId,
        threads: [thread],
        pr,
        choice: {
          provider: routing.provider,
          model: routing.model,
          ...(routing.effort !== undefined &&
            routing.effort !== null && { effort: routing.effort }),
        },
        instructions: instruction,
        mode: 'retry',
        priorContext: [
          {
            threadId,
            reply: row?.thread.replyDraft ?? null,
            ...(row?.thread.commitShas != null && { commitShas: row.thread.commitShas }),
            intent: 'retry',
          },
        ],
        spawnAgent,
        setAgentConfig,
      }).catch((error: unknown) => showToast('error', formatError(error)));
    },
    [github, roleModels, rows, sessionId, setAgentConfig, showToast, spawnAgent, threadsByThreadId],
  );

  const onLater = useCallback(
    ({ itemId }: { readonly itemId: string }): void => {
      void deferResolveQueueItem({ sessionId, itemId }).catch((error: unknown) =>
        showToast('error', formatError(error)),
      );
    },
    [deferResolveQueueItem, sessionId, showToast],
  );

  const onResume = useCallback(
    ({ itemId }: { readonly itemId: string }): void => {
      void takeUpResolveQueueItem({ sessionId, itemId }).catch((error: unknown) =>
        showToast('error', formatError(error)),
      );
    },
    [sessionId, showToast, takeUpResolveQueueItem],
  );

  const onStartResolveRun = async (): Promise<void> => {
    const pr = github?.pr;
    if (pr == null) {
      return;
    }
    setIsSpawning(true);
    try {
      await startResolveRun({ sessionId, pr, spawnConfig, spawnAgent, setAgentConfig });
      setIsConfiguring(false);
    } finally {
      setIsSpawning(false);
    }
  };

  const renderRow = useCallback(
    ({ row }: { readonly row: QueueRow }): ReactNode => (
      <ResolveQueueRow
        key={row.thread.threadId}
        row={row}
        isSelected={row.thread.threadId === view.expandedThreadId}
        onOpen={() => onSelect(row.thread.threadId)}
        onLater={() => onLater({ itemId: row.item.id })}
        onResume={() => onResume({ itemId: row.item.id })}
        onOpenCommit={({ sha }) =>
          onOpenInDiff({
            threadId: row.thread.threadId,
            sha,
            path: row.reviewerNote?.path ?? null,
            line: row.reviewerNote?.line ?? null,
          })
        }
      />
    ),
    [onLater, onOpenInDiff, onResume, onSelect, view.expandedThreadId],
  );

  if (github?.pr == null) {
    return (
      <PaneShell title={RESOLVE_QUEUE_TITLE}>
        <NoResolveTargetState onOpenReview={() => openReview({ sessionId })} />
      </PaneShell>
    );
  }

  const refreshError = github.detailError ?? null;
  const errorPlacement = resolveQueueErrorPlacement({
    error: refreshError,
    hasLoadedComments: github.detail !== null,
  });

  if (errorPlacement === 'whole_surface' && refreshError !== null) {
    return (
      <PaneShell title={RESOLVE_QUEUE_TITLE}>
        <ResolveQueueErrorState
          message={refreshError}
          onRetry={() => void refreshSessionPrDetail(sessionId, { force: true })}
        />
      </PaneShell>
    );
  }

  const isLoading = github.detail === null && github.detailLoading;
  const isRunLive = hasActiveResolveRun({ attempts });

  return (
    <InspectorSplit
      defaultWidth={DETAIL_WIDTH}
      open={selectedRow !== null}
      panel={
        selectedRow === null ? null : (
          <ResolveItemContainer
            key={selectedRow.thread.threadId}
            sessionId={sessionId}
            row={selectedRow}
            allRows={rows}
            worktreePath={repo?.worktreePath ?? null}
            onSelect={onSelect}
            onAskForChanges={onAskForChanges}
            onOpenInDiff={onOpenInDiff}
          />
        )
      }
    >
      <PaneShell
        title={RESOLVE_QUEUE_TITLE}
        actions={
          isConfiguring ? null : (
            <Tooltip
              content={isRunLive ? RESOLVE_RUN_IN_PROGRESS : RESOLVE_QUEUE_ACTION_LABEL.startRun}
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={isRunLive}
                onClick={() => setIsConfiguring(true)}
              >
                {RESOLVE_QUEUE_ACTION_LABEL.startRun}
              </Button>
            </Tooltip>
          )
        }
      >
        <Divider />
        {isConfiguring ? (
          <ResolveSpawnSheet
            value={spawnConfig}
            onChange={setSpawnConfig}
            disabled={false}
            isBusy={isSpawning}
            onStart={() => void onStartResolveRun()}
            onCancel={() => setIsConfiguring(false)}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-4" ref={listRef}>
            {errorPlacement === 'inline' && refreshError !== null && (
              <ErrorStrip
                label={RESOLVE_QUEUE_REFRESH_LABEL}
                error={new Error(refreshError)}
                onRetry={() => void refreshSessionPrDetail(sessionId, { force: true })}
              />
            )}
            <QueueFilterChips
              filter={view.filter}
              needsReviewCount={groups.needsReview.length}
              activeCount={groups.active.length}
              onChange={(filter) => setResolveQueueView({ sessionId, patch: { filter } })}
            />
            {isLoading && (
              <div className="flex flex-col gap-4">
                {SKELETON_ROWS.map((key) => (
                  <div key={key} className="flex flex-col gap-2 px-3 py-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3.5 w-48" />
                  </div>
                ))}
              </div>
            )}
            {!isLoading && listed.length === 0 && (
              <NothingWaitingState hasOtherActiveWork={groups.active.length > 0} />
            )}
            {!isLoading && listed.length > 0 && (
              <div className="flex flex-col gap-4">
                {listGroups.map((group) => (
                  <div key={group.key} className="flex min-w-0 flex-col gap-2">
                    {group.attemptId !== null && (
                      <SectionHeader
                        label={sharedRunHeading({ count: group.rows.length })}
                        headingLevel={3}
                      />
                    )}
                    <ol className="flex flex-col gap-2">
                      {group.rows.map((row) => renderRow({ row }))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
            <ResolveQueueFooter
              completed={groups.completed}
              later={groups.later}
              renderRow={renderRow}
            />
          </div>
        )}
      </PaneShell>
    </InspectorSplit>
  );
};
