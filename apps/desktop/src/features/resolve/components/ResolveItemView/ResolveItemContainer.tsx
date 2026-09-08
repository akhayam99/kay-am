import { useEffect, useMemo, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { ResolveCheckRun, ResolveQueueItemWithThread, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { useAgentMetrics } from '../../../session/hooks/useAgentMetrics';
import type { ScriptGroup } from '../../../scripts/scripts';
import { acceptedItemIds } from '../../acceptedItemIds';
import { summariseResolveChecks } from '../../checkReceipts';
import type { ResolveQueueRow } from '../../buildResolveQueueRows';
import { useResolveCandidateDiff } from '../../hooks/useResolveCandidateDiff';
import { resolveQueueNeighbours } from '../../orderResolveQueueRows';
import { candidateHeadSha, selectResolveCandidate } from '../../selectResolveCandidate';
import { selectResolveCheckScript } from '../../selectResolveCheckScript';
import type { ResolveCandidateWithItems } from '../../../../store/slices/resolve/state';
import { ResolveItemView } from './index';

type Props = {
  readonly sessionId: SessionId;
  readonly row: ResolveQueueRow;
  readonly allRows: ReadonlyArray<ResolveQueueRow>;
  readonly orderedRows: ReadonlyArray<ResolveQueueRow>;
  readonly worktreePath: string | null;
  readonly onSelect: (threadId: string | null) => void;
  readonly onAskForChanges: (params: {
    readonly threadId: string;
    readonly instruction: string;
  }) => void;
  readonly onOpenInDiff: (params: {
    readonly threadId: string;
    readonly sha: string;
    readonly path: string | null;
    readonly line: number | null;
  }) => void;
};

const EMPTY_CANDIDATES: ReadonlyArray<ResolveCandidateWithItems> = [];
const EMPTY_CHECK_RUNS: ReadonlyArray<ResolveCheckRun> = [];
const EMPTY_QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [];
const EMPTY_SCRIPT_GROUPS: ReadonlyArray<ScriptGroup> = [];

export const ResolveItemContainer = ({
  sessionId,
  row,
  allRows,
  orderedRows,
  worktreePath,
  onSelect,
  onAskForChanges,
  onOpenInDiff,
}: Props) => {
  const candidates = useAppStore((s) => s.sessionResolveCandidates[sessionId] ?? EMPTY_CANDIDATES);
  const checkRuns = useAppStore((s) => s.sessionResolveCheckRuns[sessionId] ?? EMPTY_CHECK_RUNS);
  const queueItems = useAppStore((s) => s.sessionResolveQueueItems[sessionId] ?? EMPTY_QUEUE_ITEMS);
  const scriptGroups = useAppStore(
    (s) =>
      (worktreePath === null ? undefined : s.discoveredScripts[sessionId]?.[worktreePath]) ??
      EMPTY_SCRIPT_GROUPS,
  );
  const acceptResolveQueueItem = useAppStore((s) => s.acceptResolveQueueItem);
  const deferResolveQueueItem = useAppStore((s) => s.deferResolveQueueItem);
  const runResolveCheck = useAppStore((s) => s.runResolveCheck);
  const forceCloseResolver = useAppStore((s) => s.forceCloseResolver);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const loadDiscoveredScripts = useAppStore((s) => s.loadDiscoveredScripts);
  const metrics = useAgentMetrics({ sessionId });

  const [reply, setReply] = useState(row.proposal ?? '');
  const [instruction, setInstruction] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isCheckRunning, setIsCheckRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReply(row.proposal ?? '');
    setInstruction('');
    setError(null);
  }, [row.proposal, row.thread.threadId]);

  useEffect(() => {
    if (worktreePath === null) {
      return;
    }
    void loadDiscoveredScripts({ sessionId, worktreePath });
  }, [loadDiscoveredScripts, sessionId, worktreePath]);

  const candidate = useMemo(
    () => selectResolveCandidate({ candidates, itemId: row.item.id }),
    [candidates, row.item.id],
  );
  const diff = useResolveCandidateDiff({ candidate });
  const checks = useMemo(
    () =>
      summariseResolveChecks({
        runs: checkRuns.filter((run) => run.candidateId === candidate?.id),
        candidate,
        acceptedSet: acceptedItemIds({ entries: queueItems }),
      }),
    [candidate, checkRuns, queueItems],
  );
  const coveredRows = useMemo(
    () =>
      row.coveredThreadIds.flatMap((threadId) => {
        const covered = allRows.find((item) => item.thread.threadId === threadId);
        return covered === undefined ? [] : [covered];
      }),
    [allRows, row.coveredThreadIds],
  );
  const neighbours = resolveQueueNeighbours({
    rows: orderedRows,
    threadId: row.thread.threadId,
  });
  const checkScript = useMemo(
    () => selectResolveCheckScript({ groups: scriptGroups }),
    [scriptGroups],
  );
  const costUsd =
    row.attempt === null
      ? null
      : (metrics.aggregatesByAgentId.get(row.attempt.agentId)?.estimatedCostUsd ?? null);

  const guard = async ({ run }: { readonly run: () => Promise<void> }): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await run();
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const onAccept = (): void => {
    void guard({
      run: () =>
        acceptResolveQueueItem({
          sessionId,
          itemId: row.item.id,
          revision: row.thread.revision,
          reply,
        }),
    });
  };

  const onLater = (): void => {
    void guard({
      run: async () => {
        await deferResolveQueueItem({ sessionId, itemId: row.item.id });
        onSelect(null);
      },
    });
  };

  const onRunCheck = (): void => {
    if (candidate === null || checkScript === null || worktreePath === null) {
      return;
    }
    setIsCheckRunning(true);
    setError(null);
    void runResolveCheck({
      sessionId,
      candidateId: candidate.id,
      command: checkScript.command,
      name: checkScript.name,
      testIdentity: null,
      breadth: 'full',
    })
      .catch((caught: unknown) => setError(formatError(caught)))
      .finally(() => setIsCheckRunning(false));
  };

  return (
    <ResolveItemView
      row={row}
      coveredRows={coveredRows}
      files={diff.files}
      isDiffLoading={diff.isLoading}
      diffError={diff.error}
      checks={checks}
      costUsd={costUsd}
      reply={reply}
      instruction={instruction}
      isBusy={isBusy}
      canAccept={row.status === 'for_you' || row.status === 'changed_since_accepted'}
      canRunCheck={candidate !== null && checkScript !== null}
      isCheckRunning={isCheckRunning}
      error={error}
      hasPrevious={neighbours.previousThreadId !== null}
      hasNext={neighbours.nextThreadId !== null}
      onChangeReply={setReply}
      onChangeInstruction={setInstruction}
      onAccept={onAccept}
      onAskForChanges={() =>
        onAskForChanges({ threadId: row.thread.threadId, instruction: instruction.trim() })
      }
      onLater={onLater}
      onOpenInDiff={() => {
        if (candidate === null) {
          return;
        }
        onOpenInDiff({
          threadId: row.thread.threadId,
          sha: candidateHeadSha({ candidate }),
          path: row.reviewerNote?.path ?? null,
          line: row.reviewerNote?.line ?? null,
        });
      }}
      onRunCheck={onRunCheck}
      onStopRun={() => {
        if (row.attempt !== null) {
          void forceCloseResolver(sessionId, row.attempt.agentId);
        }
      }}
      onViewWork={() => {
        if (row.attempt !== null) {
          void selectAgent(sessionId, row.attempt.agentId);
        }
      }}
      onPrevious={() => onSelect(neighbours.previousThreadId)}
      onNext={() => onSelect(neighbours.nextThreadId)}
      onCollapse={() => onSelect(null)}
    />
  );
};
