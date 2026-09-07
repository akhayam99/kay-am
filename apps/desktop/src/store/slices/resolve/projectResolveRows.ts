import type { ResolveAttempt, ResolveThread, SessionId } from '@goodboy/types';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import type { ResolverState } from '../../../features/workspace/components/WorkspacesSidebar/lib';
import type { ResolverThreadOutcome } from '../../types';
import { threadOutcome } from './threadOutcome';
import type { SliceParams } from './types';

type Params = SliceParams & {
  readonly sessionId: SessionId;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly attempts: ReadonlyArray<ResolveAttempt>;
  readonly fallbackOwnership?: Readonly<Record<string, ReadonlyArray<string>>>;
};

export const projectResolveRows = ({
  set,
  get,
  sessionId,
  rows,
  attempts,
  fallbackOwnership = {},
}: Params): void => {
  const resolverThreadOutcomes = { ...get().resolverThreadOutcomes };
  const resolverState = { ...get().resolverState };
  for (const agent of get().sessionPhaseRuns[sessionId] ?? []) {
    const sourceThreadIds = agentThreadIds(agent);
    const owned = new Set(
      sourceThreadIds.length > 0
        ? sourceThreadIds
        : attempts
            .filter((attempt) => attempt.agentId === agent.id)
            .flatMap((attempt) => attempt.threadIds),
    );
    if (sourceThreadIds.length === 0) {
      for (const threadId of fallbackOwnership[agent.id] ??
        Object.keys(get().resolverThreadOutcomes[agent.id] ?? {})) {
        owned.add(threadId);
      }
    }
    const threads = rows.filter((row) => owned.has(row.threadId));
    if (threads.length === 0) {
      continue;
    }
    const outcomes: Record<string, ResolverThreadOutcome> = {};
    for (const row of threads) {
      const outcome = threadOutcome({ row });
      if (outcome !== null) {
        outcomes[row.threadId] = outcome;
      }
    }
    const kinds = Object.values(outcomes).map((outcome) => outcome.kind);
    const nextState: ResolverState | undefined = threads.some(
      (row) => row.stateReason === 'stopped' || row.stateReason?.startsWith('stopped:') === true,
    )
      ? 'stopped'
      : threads.some((row) => row.state === 'failed' || row.question !== null)
        ? 'awaiting'
        : kinds.length === 0
          ? undefined
          : kinds.length < owned.size
            ? 'awaiting'
            : kinds.includes('resolved')
              ? 'committed'
              : kinds.every((kind) => kind === 'wontfix')
                ? 'wontfix'
                : 'analyzed';
    resolverThreadOutcomes[agent.id] = outcomes;
    if (nextState === undefined) {
      delete resolverState[agent.id];
    } else {
      resolverState[agent.id] = nextState;
    }
  }
  set((state) => ({
    sessionResolveThreads: { ...state.sessionResolveThreads, [sessionId]: rows },
    sessionResolveAttempts: { ...state.sessionResolveAttempts, [sessionId]: attempts },
    sessionResolvedThreads: {
      ...state.sessionResolvedThreads,
      [sessionId]: rows
        .filter((row) => row.githubResolved === true && row.state === 'closed')
        .map((row) => row.threadId),
    },
    resolverThreadOutcomes,
    resolverState,
  }));
};
