import type { SessionId } from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { recordMountBranchObservation } from '../project-mounts/mountBranchObservations';
import { selectUnambiguousProjectMount } from '../project-mounts/selectors';
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
    const activeMountId = state.sessionActiveMount[sessionId] ?? session?.activeMountId ?? null;
    const identified =
      activeMountId === null ? undefined : mounts.find((mount) => mount.mountId === activeMountId);
    const active =
      identified ??
      (activeProjectId == null
        ? null
        : selectUnambiguousProjectMount({ state, sessionId, projectId: activeProjectId }));
    const mountId = active?.mountId;
    if (active == null || mountId === undefined) {
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
