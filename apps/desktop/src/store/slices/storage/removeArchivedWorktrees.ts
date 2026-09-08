import { removeWorktree } from '../../../features/worktree/worktree';
import { collectArchivedWorktrees } from './collectArchivedWorktrees';
import type { GetFn, SetFn, WorktreeRemovalResult } from './types';

export const removeArchivedWorktrees = (_set: SetFn, get: GetFn) => {
  return async (): Promise<WorktreeRemovalResult> => {
    const targets = await collectArchivedWorktrees({ projects: get().projects });
    let removed = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        await removeWorktree(target.repoPath, target.worktreePath);
        removed += 1;
      } catch {
        failed += 1;
      }
    }
    await get().loadStorageStats();
    return { removed, failed };
  };
};
