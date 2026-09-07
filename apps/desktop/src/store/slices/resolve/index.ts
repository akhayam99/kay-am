import { cancelPublication } from './cancelPublication';
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
import type {
  ResolveActions,
  BatchUpdateParams,
  AttemptParams,
  DrainParams,
  PhaseParams,
  PreparePublicationParams,
  PublishParams,
  SessionParams,
  SliceParams,
  TurnParams,
  UpdateParams,
  WorktreeDrainParams,
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
    updateResolveThreads: (params: BatchUpdateParams) =>
      serialize({ run: () => updateResolveThreads({ set, get, ...params }) }),
    loadResolveSession: (params: SessionParams) =>
      serialize({ run: () => loadResolveSession({ set, get, ...params }) }),
    persistResolveTurn: (params: TurnParams) =>
      serialize({ run: () => persistResolveTurn({ set, get, ...params }) }),
    recordResolveAttempt: (params: AttemptParams) =>
      serialize({ run: () => recordResolveAttempt({ set, get, ...params }) }),
    recordResolvePhase: (params: PhaseParams) =>
      serialize({ run: () => recordResolvePhase({ set, get, ...params }) }),
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
