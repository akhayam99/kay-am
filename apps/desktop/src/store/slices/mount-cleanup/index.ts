import { cleanupSessionMounts } from './cleanupSessionMounts';
import { proposeMountCleanup } from './proposeMountCleanup';
import { loadMountCleanupProposals, resolveMountCleanup } from './resolveMountCleanup';
import type { GetFn, SetFn } from './types';

export type {
  CleanupSessionMountsInput,
  ProposeMountCleanupInput,
  ResolveMountCleanupInput,
  SessionCleanupKeyInput,
  SessionCleanupOutcome,
} from './types';
export { cleanupMountDirectory } from './cleanupPolicy';
export { reconcileWorktreeOwnership } from './retainedPaths';
export { mountCleanupInitialState } from './state';

export const createMountCleanupSlice = (set: SetFn, get: GetFn) => {
  return {
    cleanupSessionMounts: cleanupSessionMounts(set, get),
    proposeMountCleanup: proposeMountCleanup(set, get),
    loadMountCleanupProposals: loadMountCleanupProposals(set, get),
    resolveMountCleanup: resolveMountCleanup(set, get),
  };
};
