import { useEffect, useMemo, useState } from 'react';
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
import { openReview } from '../../../review/openReview';
import { useReviewDiff } from '../../../review/components/ReviewPane/WriteReview/useReviewDiff';
import { DEFAULT_AGENT_SPAWN_CONFIG } from '../../../session/components/AgentSpawnConfig/defaultAgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { useResolveDeliveryReceipts } from '../../hooks/useResolveDeliveryReceipts';
import { buildResolveQueueRows } from '../../buildResolveQueueRows';
import { groupResolveQueue } from '../../groupResolveQueue';
import { buildResolveQueueChecksByThreadId } from '../../resolveQueueChecksSummary';
import { isInlineAcceptEligible } from '../../isInlineAcceptEligible';
import { forYouHeading, secondaryStatusLine } from '../../resolveQueueCopy';
import { ResolveSpawnSheet } from '../ResolveSpawnSheet';
import { ResolveQueueRow } from './ResolveQueueRow';
import { ResolveQueueFooter } from './ResolveQueueFooter';
import { NoResolveTargetState, NothingWaitingState, ResolveQueueErrorState } from './ResolveQueueEmptyState';

type Props = {
  readonly session: Session;
};

const EMPTY_QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [];
const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];
const EMPTY_PUBLICATIONS: ReadonlyArray<ResolvePublication> = [];
const EMPTY_CHECKS: ReadonlyArray<PrCheckRun> = [];

export const ResolveQueueHome = ({ session }: Props) => {
  const sessionId = session.id as SessionId;
  const github = useAppStore((s) => s.sessionGithub[sessionId] ?? null);
  const comments = useAppStore(
    (s) =>
      s.sessionGithub[sessionId]?.detail?.comments ?? (EMPTY_ARRAY as ReadonlyArray<PrComment>),
  );
  const checks = useAppStore((s) => s.sessionGithub[sessionId]?.detail?.checks ?? EMPTY_CHECKS);
  const queueItems = useAppStore(
    (s) => s.sessionResolveQueueItems[sessionId] ?? EMPTY_QUEUE_ITEMS,
  );
  const attempts = useAppStore((s) => s.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS);
  const publications = useAppStore(
    (s) => s.sessionResolvePublications[sessionId] ?? EMPTY_PUBLICATIONS,
  );
  const loadResolveSession = useAppStore((s) => s.loadResolveSession);
  const acceptResolveQueueItem = useAppStore((s) => s.acceptResolveQueueItem);
  const takeUpResolveQueueItem = useAppStore((s) => s.takeUpResolveQueueItem);
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setAgentConfig = useAppStore((s) => s.setAgentConfig);

  const deliveryReceipts = useResolveDeliveryReceipts({ publications });
  const diff = useReviewDiff({ session });
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

  const checksByThreadId = useMemo(
    () =>
      buildResolveQueueChecksByThreadId({
        threadPaths: new Map(rows.map((row) => [row.thread.threadId, row.reviewerNote?.path ?? null])),
        checks,
        files: diff.files,
      }),
    [checks, diff.files, rows],
  );

  const onOpen = ({ threadId }: { readonly threadId: string }): void => {
    openReview({ sessionId, threadId });
  };

  const onAcceptFix = ({
    threadIds,
  }: {
    readonly threadIds: ReadonlyArray<string>;
  }): void => {
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
      });
    }
  };

  const onTakeUp = ({ threadId, itemId }: { readonly threadId: string; readonly itemId: string }): void => {
    void takeUpResolveQueueItem({ sessionId, itemId });
    onOpen({ threadId });
  };

  const onStartResolveRun = async (): Promise<void> => {
    const pr = github?.pr;
    if (pr == null) {
      return;
    }
    setIsSpawning(true);
    try {
      const agentId = await spawnAgent(sessionId, {
        name: `Resolve PR #${pr.number}`,
        ...(spawnConfig.provider !== '' && { provider: spawnConfig.provider }),
        model: spawnConfig.model,
        effort: spawnConfig.effort,
        initialPrompt:
          `Resolve the outstanding review comments on PR #${pr.number} (${pr.title}). ` +
          `Check each unresolved thread and propose a fix or a reply.${
            spawnConfig.hint.trim() === '' ? '' : ` ${spawnConfig.hint.trim()}`
          }`,
        kindOverride: 'resolver',
        sourceCommentUrl: pr.url,
        sourceKind: 'review_comment',
        focus: 'none',
      });
      await setAgentConfig(sessionId, agentId, {
        ...(spawnConfig.provider !== '' && { providerOverride: spawnConfig.provider }),
        modelOverride: spawnConfig.model,
        effort: spawnConfig.effort,
      });
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
      <div className={PANE_RHYTHM.stack}>
        <ResolveSpawnSheet
          value={spawnConfig}
          onChange={setSpawnConfig}
          disabled={false}
          isBusy={isSpawning}
          startLabel="Start a resolve run"
          onStart={() => void onStartResolveRun()}
        />
        {groups.forYou.length === 0 ? (
          <NothingWaitingState onOpenSpawn={() => void onStartResolveRun()} />
        ) : (
          <ol className="flex flex-col gap-1.5">
            {groups.forYou.map((row) => {
              const checksSummary = checksByThreadId.get(row.thread.threadId) ?? null;
              const isEligible = isInlineAcceptEligible({ status: row.status, checks: checksSummary });
              const acceptSummary = isEligible && checksSummary !== null
                ? `+${checksSummary.additions} -${checksSummary.deletions} · ${checksSummary.passCount} pass · reply drafted`
                : null;
              return (
                <ResolveQueueRow
                  key={row.thread.threadId}
                  row={row}
                  isAcceptEligible={isEligible}
                  acceptSummary={acceptSummary}
                  onOpen={() => onOpen({ threadId: row.thread.threadId })}
                  onAcceptFix={() =>
                    onAcceptFix({ threadIds: [row.thread.threadId, ...row.coveredThreadIds] })
                  }
                />
              );
            })}
          </ol>
        )}
        <ResolveQueueFooter
          pushed={groups.pushed}
          later={groups.later}
          onOpen={onOpen}
          onTakeUp={onTakeUp}
        />
      </div>
    </PaneShell>
  );
};
