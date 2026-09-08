import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type {
  PrCheckRun,
  PrComment,
  ResolveAttempt,
  ResolvePublication,
  ResolveQueueItemWithThread,
  Session,
  SessionId,
} from '@goodboy/types';
import { PANE_RHYTHM } from '@goodboy/ui';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { PaneShell } from '../../../../shared/components/PaneShell';
import { useToast } from '../../../../app/components/Toast';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import { EMPTY_RESOLVE_QUEUE_VIEW } from '../../../../store/slices/session-view';
import { groupThreads } from '../../../github/comment-threads';
import { kindRouting } from '../../../session/agent-kind';
import { startFixAttempt } from '../../../review/startFixAttempt';
import { openReview } from '../../../review/openReview';
import { useReviewDiff } from '../../../review/components/ReviewPane/WriteReview/useReviewDiff';
import { DEFAULT_AGENT_SPAWN_CONFIG } from '../../../session/components/AgentSpawnConfig/defaultAgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { useResolveDeliveryReceipts } from '../../hooks/useResolveDeliveryReceipts';
import { startResolveRun } from '../../startResolveRun';
import { buildResolveQueueRows } from '../../buildResolveQueueRows';
import { groupResolveQueue } from '../../groupResolveQueue';
import { orderResolveQueueRows } from '../../orderResolveQueueRows';
import { buildResolveQueueChecksByThreadId } from '../../resolveQueueChecksSummary';
import { isInlineAcceptEligible } from '../../isInlineAcceptEligible';
import { forYouHeading, secondaryStatusLine } from '../../resolveQueueCopy';
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
  const acceptResolveQueueItem = useAppStore((s) => s.acceptResolveQueueItem);
  const takeUpResolveQueueItem = useAppStore((s) => s.takeUpResolveQueueItem);
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const setResolveQueueView = useAppStore((s) => s.setResolveQueueView);
  const openResolveDiff = useAppStore((s) => s.openResolveDiff);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setAgentConfig = useAppStore((s) => s.setAgentConfig);

  const deliveryReceipts = useResolveDeliveryReceipts({ publications });
  const diff = useReviewDiff({ session });
  const repo = useSessionRepo({ sessionId });
  const roleModels = useSessionRoleModels({ sessionId });
  const [spawnConfig, setSpawnConfig] = useState<AgentSpawnConfigValue>(DEFAULT_AGENT_SPAWN_CONFIG);
  const [isSpawning, setIsSpawning] = useState(false);

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
  const listed = useMemo(() => {
    const filtered = view.filter === 'for_you' ? groups.forYou : rows;
    const isExpandedListed = filtered.some((row) => row.thread.threadId === view.expandedThreadId);
    const expanded = isExpandedListed
      ? null
      : (rows.find((row) => row.thread.threadId === view.expandedThreadId) ?? null);
    return orderResolveQueueRows({
      rows: expanded === null ? filtered : [...filtered, expanded],
      pinned: view.order,
    });
  }, [groups.forYou, rows, view.expandedThreadId, view.filter, view.order]);

  useEffect(() => {
    const node = scrollableAncestor(listRef.current);
    if (node === null || view.scrollTop === 0) {
      return;
    }
    node.scrollTop = view.scrollTop;
  }, [view.scrollTop]);

  const checksByThreadId = useMemo(
    () =>
      buildResolveQueueChecksByThreadId({
        threadPaths: new Map(
          rows.map((row) => [row.thread.threadId, row.reviewerNote?.path ?? null]),
        ),
        checks,
        files: diff.files,
      }),
    [checks, diff.files, rows],
  );

  const threadsByThreadId = useMemo(() => {
    const map = new Map(
      groupThreads(comments.filter((comment) => comment.source === 'review')).flatMap((thread) =>
        thread.head.threadId == null ? [] : [[thread.head.threadId, thread] as const],
      ),
    );
    return map;
  }, [comments]);

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

  const onAcceptFix = ({ threadIds }: { readonly threadIds: ReadonlyArray<string> }): void => {
    for (const threadId of threadIds) {
      const row = rows.find((candidate) => candidate.thread.threadId === threadId);
      if (row === undefined) {
        continue;
      }
      void acceptResolveQueueItem({
        sessionId,
        itemId: row.item.id,
        revision: row.thread.revision,
        reply: row.proposal ?? '',
      }).catch((error: unknown) => showToast('error', formatError(error)));
    }
  };

  const onTakeUp = ({
    threadId,
    itemId,
  }: {
    readonly threadId: string;
    readonly itemId: string;
  }): void => {
    void takeUpResolveQueueItem({ sessionId, itemId });
    onSelect(threadId);
  };

  const onStartResolveRun = async (): Promise<void> => {
    const pr = github?.pr;
    if (pr == null) {
      return;
    }
    setIsSpawning(true);
    try {
      await startResolveRun({ sessionId, pr, spawnConfig, spawnAgent, setAgentConfig });
    } finally {
      setIsSpawning(false);
    }
  };

  if (github?.pr == null) {
    return (
      <PaneShell title="For you" description="No pull request is open on this session.">
        <NoResolveTargetState onOpenReview={() => openReview({ sessionId })} />
      </PaneShell>
    );
  }

  if (github.detailError != null) {
    return (
      <PaneShell title="For you">
        <ResolveQueueErrorState
          message={github.detailError}
          onRetry={() => void refreshSessionPrDetail(sessionId, { force: true })}
        />
      </PaneShell>
    );
  }

  return (
    <PaneShell
      title={forYouHeading({ count: groups.forYou.length })}
      description={secondaryStatusLine({
        workingCount: groups.workingCount,
        readyToPushCount: groups.readyToPushCount,
      })}
    >
      <div className={PANE_RHYTHM.stack} ref={listRef}>
        <ResolveSpawnSheet
          value={spawnConfig}
          onChange={setSpawnConfig}
          disabled={false}
          isBusy={isSpawning}
          startLabel="Start a resolve run"
          onStart={() => void onStartResolveRun()}
        />
        <QueueFilterChips
          filter={view.filter}
          forYouCount={groups.forYou.length}
          everythingCount={rows.length}
          onChange={(filter) => setResolveQueueView({ sessionId, patch: { filter } })}
        />
        {listed.length === 0 ? (
          <NothingWaitingState onOpenSpawn={() => void onStartResolveRun()} />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {listed.map((row) => {
              const threadId = row.thread.threadId;
              if (view.expandedThreadId === threadId) {
                return (
                  <li key={threadId} className="list-none">
                    <ResolveItemContainer
                      sessionId={sessionId}
                      row={row}
                      allRows={rows}
                      orderedRows={listed}
                      worktreePath={repo?.worktreePath ?? null}
                      onSelect={onSelect}
                      onAskForChanges={onAskForChanges}
                      onOpenInDiff={onOpenInDiff}
                    />
                  </li>
                );
              }
              const checksSummary = checksByThreadId.get(threadId) ?? null;
              const isEligible = isInlineAcceptEligible({
                status: row.status,
                checks: checksSummary,
              });
              const acceptSummary =
                isEligible && checksSummary !== null
                  ? `+${checksSummary.additions} -${checksSummary.deletions} · ${checksSummary.passCount} pass · reply drafted`
                  : null;
              return (
                <ResolveQueueRow
                  key={threadId}
                  row={row}
                  isAcceptEligible={isEligible}
                  acceptSummary={acceptSummary}
                  onOpen={() => onSelect(threadId)}
                  onAcceptFix={() =>
                    onAcceptFix({ threadIds: [threadId, ...row.coveredThreadIds] })
                  }
                />
              );
            })}
          </ol>
        )}
        <ResolveQueueFooter
          pushed={groups.pushed}
          later={groups.later}
          onOpen={({ threadId }) => onSelect(threadId)}
          onTakeUp={onTakeUp}
        />
      </div>
    </PaneShell>
  );
};
