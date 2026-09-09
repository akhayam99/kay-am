import type { SessionMountView } from '@goodboy/types';
import { runMountRecoveryOnce } from './mountRecoveryGuard';
import { applyMountViews, loadMountViews } from './mountViews';
import { recoverMountOperations } from './recoverMountOperations';
import { verifyAvailableWorktrees } from './verifyAvailableWorktrees';
import type { GetFn, SessionKeyInput, SetFn } from './types';

export const loadSessionMounts = (set: SetFn, get: GetFn) => {
  return async ({ sessionId }: SessionKeyInput): Promise<ReadonlyArray<SessionMountView>> => {
    const views = await loadMountViews({ get, sessionId });
    const available = await verifyAvailableWorktrees({
      sessionId,
      candidates: views.flatMap((view) =>
        view.worktreePath === null || !view.isAttached ? [] : [view],
      ),
      projects: get().projects,
    });
    const availableIds = new Set(available.map((view) => view.id));
    const verifiedViews: ReadonlyArray<SessionMountView> = (
      await loadMountViews({ get, sessionId })
    ).map((view) => {
      const project = get().projects.find((candidate) => candidate.id === view.projectId);
      if (
        view.worktreePath === null ||
        !view.isAttached ||
        project?.kind !== 'repo' ||
        availableIds.has(view.id)
      ) {
        return view;
      }
      return { ...view, isAttached: false, diskState: 'unchecked' };
    });
    applyMountViews({ set, sessionId, views: verifiedViews });
    runMountRecoveryOnce({
      sessionId,
      run: () => recoverMountOperations(set, get)({ sessionId }),
    });
    return verifiedViews;
  };
};
