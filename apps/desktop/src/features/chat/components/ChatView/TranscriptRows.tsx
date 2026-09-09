import type { ReactNode } from 'react';
import type { AgentId, OpenQuestion, ProviderRunId, SessionId } from '@goodboy/types';
import type { TranscriptRow } from '../../utils/cluster-operations';
import type { ThinkingContext } from '../../utils/thinking-context';
import type { TranscriptItem } from '../../utils/transcript-items';
import { OperationsCluster } from '../OperationsCluster';
import { ThinkingIndicator } from '../ThinkingIndicator';
import { TranscriptCard } from '../TranscriptCards';
import { OpenQuestionCluster } from './OpenQuestionCluster';
import { dayKey, formatDayLabel } from './lib';
import { isWorkflowRailRow } from './workflowRailGroup';

type Props = {
  rows: ReadonlyArray<TranscriptRow>;
  oqByTurnOrdinal: ReadonlyMap<number | null, ReadonlyArray<OpenQuestion>>;
  sessionId: SessionId;
  selectedAgentId: AgentId | null;
  workingDir: string | null;
  onRefreshAuth: () => void;
  onOpenDiff: (filePath: string) => void;
  isThinking: boolean;
  thinkingContext: ThinkingContext;
  onRetryError: (item: Extract<TranscriptItem, { kind: 'error' }>) => void;
  retryingErrorRunId: ProviderRunId | null;
  mountSuggestionsByRun?: ReadonlyMap<ProviderRunId, ReactNode>;
};

const RUN_BEARING_KINDS = new Set<TranscriptItem['kind']>([
  'error',
  'permission_request',
  'permission_decision',
]);

const rowRunId = ({ row }: { readonly row: TranscriptRow }): ProviderRunId | null => {
  if (row.kind !== 'item' || !RUN_BEARING_KINDS.has(row.item.kind)) {
    return null;
  }
  return 'runId' in row.item ? (row.item.runId ?? null) : null;
};

const lastRowIndexByRun = ({
  rows,
}: {
  readonly rows: ReadonlyArray<TranscriptRow>;
}): ReadonlyMap<ProviderRunId, number> => {
  const byRun = new Map<ProviderRunId, number>();
  rows.forEach((row, index) => {
    const runId = rowRunId({ row });
    if (runId !== null) {
      byRun.set(runId, index);
    }
  });
  return byRun;
};

export const TranscriptRows = ({
  rows,
  oqByTurnOrdinal,
  sessionId,
  selectedAgentId,
  workingDir,
  onRefreshAuth,
  onOpenDiff,
  isThinking,
  thinkingContext,
  onRetryError,
  retryingErrorRunId,
  mountSuggestionsByRun,
}: Props) => {
  const out: ReactNode[] = [];
  const suggestions = mountSuggestionsByRun ?? new Map<ProviderRunId, ReactNode>();
  const anchors = lastRowIndexByRun({ rows });
  const placedRunIds = new Set<ProviderRunId>();

  const flushMountSuggestion = ({ index }: { readonly index: number }) => {
    for (const [runId, node] of suggestions) {
      if (placedRunIds.has(runId) || anchors.get(runId) !== index) {
        continue;
      }
      placedRunIds.add(runId);
      out.push(<li key={`mount-suggestion-${runId}`}>{node}</li>);
    }
  };
  let lastDay: string | null = null;
  let userTurnOrdinal = 0;
  let railGroup: Array<ReactNode> = [];
  let railGroupKey: string | null = null;

  const flushRailGroup = () => {
    if (railGroup.length === 0 || railGroupKey === null) {
      return;
    }
    out.push(
      <li
        key={`workflow-rail-${railGroupKey}`}
        className="flex flex-col [contain-intrinsic-size:auto_80px] [content-visibility:auto]"
      >
        {railGroup}
      </li>,
    );
    railGroup = [];
    railGroupKey = null;
  };

  const flushOrdinal = (ordinal: number) => {
    flushRailGroup();
    const cards = oqByTurnOrdinal.get(ordinal);
    if (!cards || cards.length === 0) {
      return;
    }
    out.push(
      <li key={`oq-${ordinal}`}>
        <OpenQuestionCluster
          questions={cards}
          sessionId={sessionId}
          viewerAgentId={selectedAgentId}
        />
      </li>,
    );
  };

  rows.forEach((row, idx) => {
    if (row.kind === 'item' && row.item.kind === 'done') {
      return;
    }
    if (row.kind === 'item' && row.item.kind === 'oq_answer') {
      flushOrdinal(userTurnOrdinal);
      userTurnOrdinal += 1;
      return;
    }
    if (row.kind === 'item' && row.item.kind === 'user_text') {
      flushOrdinal(userTurnOrdinal);
      userTurnOrdinal += 1;
      const at = row.item.at;
      const day = dayKey(at);
      const dayChanged = day !== lastDay;
      if (dayChanged) {
        out.push(
          <li key={`day-${day}-${idx}`} className="flex justify-center">
            <span className="rounded-full border border-border-soft bg-background px-2 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
              {formatDayLabel(at)}
            </span>
          </li>,
        );
        lastDay = day;
      }
    }
    if (row.kind === 'item' && isWorkflowRailRow({ row })) {
      railGroupKey = railGroupKey ?? row.key;
      railGroup.push(
        <TranscriptCard
          key={row.key}
          item={row.item}
          sessionId={sessionId}
          agentId={selectedAgentId}
          workingDir={workingDir}
          onRefreshAuth={onRefreshAuth}
          onOpenDiff={onOpenDiff}
          onRetryError={onRetryError}
          retryingErrorRunId={retryingErrorRunId}
        />,
      );
      return;
    }
    flushRailGroup();
    out.push(
      <li key={row.key} className="[content-visibility:auto] [contain-intrinsic-size:auto_80px]">
        {row.kind === 'operations' ? (
          <OperationsCluster
            items={row.items}
            sessionId={sessionId}
            agentId={selectedAgentId}
            workingDir={workingDir}
            onRefreshAuth={onRefreshAuth}
            onOpenDiff={onOpenDiff}
            onRetryError={onRetryError}
            retryingErrorRunId={retryingErrorRunId}
          />
        ) : (
          <TranscriptCard
            item={row.item}
            sessionId={sessionId}
            agentId={selectedAgentId}
            workingDir={workingDir}
            onRefreshAuth={onRefreshAuth}
            onOpenDiff={onOpenDiff}
            onRetryError={onRetryError}
            retryingErrorRunId={retryingErrorRunId}
          />
        )}
      </li>,
    );
    flushMountSuggestion({ index: idx });
  });

  flushOrdinal(userTurnOrdinal);
  const remainingOrdinals = [...oqByTurnOrdinal.keys()]
    .filter((ordinal): ordinal is number => ordinal !== null && ordinal > userTurnOrdinal)
    .sort((a, b) => a - b);
  for (const ordinal of remainingOrdinals) {
    flushOrdinal(ordinal);
  }
  for (const [runId, node] of suggestions) {
    if (placedRunIds.has(runId)) {
      continue;
    }
    placedRunIds.add(runId);
    out.push(<li key={`mount-suggestion-${runId}`}>{node}</li>);
  }
  const tailCards = oqByTurnOrdinal.get(null);
  if (tailCards != null && tailCards.length > 0) {
    out.push(
      <li key="oq-tail">
        <OpenQuestionCluster
          questions={tailCards}
          sessionId={sessionId}
          viewerAgentId={selectedAgentId}
        />
      </li>,
    );
  }
  return (
    <>
      {out}
      {isThinking ? (
        <li>
          <ThinkingIndicator context={thinkingContext} />
        </li>
      ) : null}
    </>
  );
};
