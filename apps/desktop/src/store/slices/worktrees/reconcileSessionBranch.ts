import type { SessionId } from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { recordMountBranchObservation } from '../project-mounts/mountBranchObservations';
import type { GetFn, SetFn } from './types';

export const reconcileSessionBranch = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, observedBranch: string): Promise<void> => {
    if (isBranchlessSession({ branch: get().sessionBranches[sessionId] })) {
      return;
    }
    const state = get();
    const mounts = state.sessionProjectMounts[sessionId] ?? [];
    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    const activeProjectId = state.sessionActiveProject[sessionId] ?? session?.activeProjectId;
    const active = mounts.find((mount) => mount.projectId === activeProjectId) ?? mounts[0];
    const mountId = active?.mountId;
    if (active === undefined || mountId === undefined) {
      return;
    }
    const view = (state.sessionMounts[sessionId] ?? []).find(
      (candidate) => candidate.id === mountId,
    );
    const trimmed = observedBranch.trim();
    recordMountBranchObservation({
      set,
      sessionId,
      mountId,
      recordedBranch: view?.branch ?? active.branch,
      revision: view?.revision ?? active.revision ?? 0,
      worktreePath: view?.worktreePath ?? active.worktreePath,
      observedBranch: trimmed === '' ? null : trimmed,
    });
  };
};
