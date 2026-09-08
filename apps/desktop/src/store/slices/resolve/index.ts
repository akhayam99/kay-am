import { cancelPublication } from './cancelPublication';
import { cancelResolveAttempt } from './cancelResolveAttempt';
import { drainResolveQueue } from './drainResolveQueue';
import { preparePublication } from './preparePublication';
import { publishConversations } from './publishConversations';
import { retryPublication } from './retryPublication';
import { drainResolveWorktree } from './drainResolveWorktree';
import { loadResolveSession } from './loadResolveSession';
import { persistResolveTurn } from './persistResolveTurn';
import { recordResolveAttempt } from './recordResolveAttempt';
import { recordResolvePhase } from './recordResolvePhase';
import { reconcileResolveDrains } from './reconcileResolveDrains';
import { updateResolveThreads } from './updateResolveThreads';
import { updateResolveThread } from './updateResolveThread';
import { acceptResolveQueueItem } from './acceptResolveQueueItem';
import { beginResolveCandidate } from './beginResolveCandidate';
import { captureResolveCandidate } from './captureResolveCandidate';
import { runResolveCheck } from './runResolveCheck';
import { invalidateIntegratedApprovals } from './invalidateIntegratedApprovals';
import { recoverUncapturedResolveWork } from './recoverUncapturedResolveWork';
import { deferResolveQueueItem } from './deferResolveQueueItem';
import { reopenResolveQueueItem } from './reopenResolveQueueItem';
import { takeUpResolveQueueItem } from './takeUpResolveQueueItem';
import type {
  ResolveActions,
  BatchUpdateParams,
  AttemptParams,
  CancelAttemptParams,
  DrainParams,
  PhaseParams,
  PreparePublicationParams,
  PublishParams,
  SessionParams,
  SliceParams,
  TurnParams,
  UpdateParams,
  WorktreeDrainParams,
  ItemParams,
  ItemRevisionParams,
  CandidateBeginParams,
  CandidateCaptureParams,
  CheckRunParams,
} from './types';

export const createResolveSlice = ({ set, get }: SliceParams): ResolveActions => {
  let writes: Promise<unknown> = Promise.resolve();
  type WriteParams<T> = { readonly run: () => Promise<T> };
  const serialize = <T>({ run }: WriteParams<T>): Promise<T> => {
    const next = writes.then(run, run);
    writes = next;
    return next;
  };
  return {
    acceptResolveQueueItem: (params: ItemRevisionParams) =>
      serialize({ run: () => acceptResolveQueueItem({ set, get, ...params }) }),
    deferResolveQueueItem: (params: ItemParams) =>
      serialize({ run: () => deferResolveQueueItem({ set, get, ...params }) }),
    takeUpResolveQueueItem: (params: ItemParams) =>
      serialize({ run: () => takeUpResolveQueueItem({ set, get, ...params }) }),
    reopenResolveQueueItem: (params: Omit<ItemRevisionParams, 'reply'>) =>
      serialize({ run: () => reopenResolveQueueItem({ set, get, ...params }) }),
    updateResolveThreads: (params: BatchUpdateParams) =>
      serialize({ run: () => updateResolveThreads({ set, get, ...params }) }),
    loadResolveSession: (params: SessionParams) =>
      serialize({ run: () => loadResolveSession({ set, get, ...params }) }),
    persistResolveTurn: (params: TurnParams) =>
      serialize({ run: () => persistResolveTurn({ set, get, ...params }) }),
    recordResolveAttempt: (params: AttemptParams) =>
      serialize({ run: () => recordResolveAttempt({ set, get, ...params }) }),
    cancelResolveAttempt: (params: CancelAttemptParams) =>
      serialize({ run: () => cancelResolveAttempt({ set, get, ...params }) }),
    recordResolvePhase: (params: PhaseParams) =>
      serialize({ run: () => recordResolvePhase({ set, get, ...params }) }),
    beginResolveCandidate: (params: CandidateBeginParams) =>
      serialize({ run: () => beginResolveCandidate({ set, get, ...params }) }),
    captureResolveCandidate: (params: CandidateCaptureParams) =>
      serialize({ run: () => captureResolveCandidate({ set, get, ...params }) }),
    runResolveCheck: (params: CheckRunParams) => runResolveCheck({ set, get, ...params }),
    invalidateIntegratedApprovals: (params: SessionParams) =>
      serialize({ run: () => invalidateIntegratedApprovals({ set, get, ...params }) }),
    recoverUncapturedResolveWork: (params: SessionParams) =>
      serialize({ run: () => recoverUncapturedResolveWork({ set, get, ...params }) }),
    drainResolveQueue: (params: DrainParams) =>
      serialize({ run: () => drainResolveQueue({ set, get, ...params }) }),
    drainResolveWorktree: (params: WorktreeDrainParams) =>
      serialize({ run: () => drainResolveWorktree({ set, get, ...params }) }),
    reconcileResolveDrains: () => serialize({ run: () => reconcileResolveDrains({ set, get }) }),
    updateResolveThread: (params: UpdateParams) =>
      serialize({ run: () => updateResolveThread({ set, get, ...params }) }),
    preparePublication: (params: PreparePublicationParams) =>
      preparePublication({ set, get, ...params }),
    publishConversations: (params: PublishParams) => publishConversations({ set, get, ...params }),
    retryPublication: (params: SessionParams) => retryPublication({ set, get, ...params }),
    cancelPublication: (params: PublishParams) => cancelPublication({ set, get, ...params }),
  };
};
