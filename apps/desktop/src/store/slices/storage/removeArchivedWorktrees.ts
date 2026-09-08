import { updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { cleanupMountDirectory } from '../mount-cleanup';
import { collectArchivedWorktrees } from './collectArchivedWorktrees';
import type { GetFn, SetFn, WorktreeRemovalResult } from './types';

export const removeArchivedWorktrees = (_set: SetFn, get: GetFn) => {
  return async (): Promise<WorktreeRemovalResult> => {
    const targets = await collectArchivedWorktrees({ projects: get().projects });
    let removed = 0;
    let failed = 0;
    for (const target of targets) {
      const result = await cleanupMountDirectory({
        get,
        target: {
          sessionId: target.sessionId,
          mountId: target.mountId,
          projectId: null,
          repoRoot: target.repoPath,
          worktreePath: target.worktreePath,
          branch: target.branch,
          diskState: 'present',
          isRepoProject: true,
        },
      });
      if (result.decision.kind === 'kept') {
        failed += 1;
        continue;
      }
      await updateSessionMountLifecycle({
        db: tauriDatabase,
        sessionId: target.sessionId,
        mountId: target.mountId,
        worktreePath: null,
        isAttached: false,
        diskState: result.diskState,
        expectedRevision: target.revision,
        updatedAt: new Date().toISOString() as IsoDateTime,
      }).catch(() => undefined);
      removed += 1;
    }
    await get().loadStorageStats();
    await get()
      .reconcileOrphanWorktrees()
      .catch(() => undefined);
    return { removed, failed };
  };
};
