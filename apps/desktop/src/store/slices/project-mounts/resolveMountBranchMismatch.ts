import type { SessionMountView } from '@goodboy/types';
import { worktreeStatus } from '../../../features/worktree/worktree';
import { forkMount } from './forkMount';
import { clearMountBranchObservation } from './mountBranchObservations';
import { mountError } from './mountErrors';
import { loadMountViews, requireMountView } from './mountViews';
import { selectMountBranchObservation } from './selectors';
import { switchMount } from './switchMount';
import type { GetFn, ResolveMountBranchInput, SetFn } from './types';

type GuardParams = {
  readonly worktreePath: string;
};

const refuseWhenBusy = async ({ worktreePath }: GuardParams): Promise<void> => {
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  if (status === null || status.workingTree.kind !== 'known') {
    throw mountError({
      code: 'unknown-state',
      message: 'the worktree state could not be read',
    });
  }
  if (status.inProgress !== null || status.workingTree.unmerged > 0) {
    throw mountError({
      code: 'directory-busy',
      message: 'finish the git operation in this worktree first',
    });
  }
};

export const resolveMountBranchMismatch = (set: SetFn, get: GetFn) => {
  const runSwitch = switchMount(set, get);
  const runFork = forkMount(set, get);
  return async ({
    sessionId,
    mountId,
    resolution,
  }: ResolveMountBranchInput): Promise<SessionMountView> => {
    const observation = selectMountBranchObservation({ state: get(), sessionId, mountId });
    if (observation === null || observation.state !== 'mismatch') {
      throw mountError({
        code: 'unknown-state',
        message: 'this mount has no recorded branch mismatch',
        mountId,
      });
    }
    const observedBranch = observation.observedBranch;
    if (observedBranch === null) {
      throw mountError({
        code: 'unknown-state',
        message: 'the observed branch is unknown',
        mountId,
      });
    }
    const views = await loadMountViews({ get, sessionId });
    const view = requireMountView({ views, mountId });
    if (view.revision !== observation.revision) {
      throw mountError({
        code: 'revision-conflict',
        message: 'the mount changed after the observation was recorded',
        mountId,
      });
    }
    const worktreePath = view.worktreePath;
    if (worktreePath === null) {
      throw mountError({
        code: 'unknown-state',
        message: 'this mount has no directory to resolve',
        mountId,
      });
    }
    await refuseWhenBusy({ worktreePath });
    const recordedBranch = view.branch;
    clearMountBranchObservation({ set, sessionId, mountId });
    await runSwitch({ sessionId, mountId, branch: observedBranch, createNew: false });
    if (resolution === 'keep-both') {
      await runFork({
        sessionId,
        projectId: view.projectId,
        branch: recordedBranch,
        adoptExistingBranch: true,
      });
    }
    const nextViews = await loadMountViews({ get, sessionId });
    return requireMountView({ views: nextViews, mountId });
  };
};
