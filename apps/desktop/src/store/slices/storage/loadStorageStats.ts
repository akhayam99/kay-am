import {
  getDatabaseSizeBytes,
  getTurnEventStatsForSessions,
  listArchivedSessionRefs,
  listAllRetainedWorktreePaths,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { worktreeDirectorySize } from '../../../features/worktree/worktree';
import { collectArchivedWorktrees } from './collectArchivedWorktrees';
import type { GetFn, RetainedWorktreeTarget, SetFn } from './types';

const collectRetained = async (): Promise<ReadonlyArray<RetainedWorktreeTarget>> => {
  const paths = await listAllRetainedWorktreePaths({ db: tauriDatabase }).catch(() => []);
  return Promise.all(
    paths.map(async (path) => {
      const size = await worktreeDirectorySize({ path: path.worktreePath }).catch(() => null);
      return {
        id: path.id,
        repoRoot: path.repoRoot,
        worktreePath: path.worktreePath,
        branch: path.branch,
        reason: path.reason,
        sizeBytes: size?.sizeBytes ?? null,
      };
    }),
  );
};

export const loadStorageStats = (set: SetFn, get: GetFn) => {
  return async () => {
    set({ storageStatsLoading: true });
    try {
      const refs = await listArchivedSessionRefs({ db: tauriDatabase });
      const [databaseBytes, transcripts, archivedWorktrees, retainedWorktrees] = await Promise.all([
        getDatabaseSizeBytes({ db: tauriDatabase }),
        getTurnEventStatsForSessions({
          db: tauriDatabase,
          sessionIds: refs.map((ref) => ref.sessionId),
        }),
        collectArchivedWorktrees({ projects: get().projects }),
        collectRetained(),
      ]);
      set({
        storageStats: {
          databaseBytes,
          archivedSessionCount: refs.length,
          archivedTranscriptRows: transcripts.rowCount,
          archivedTranscriptBytes: transcripts.payloadBytes,
          archivedWorktrees,
          retainedWorktrees,
        },
        storageStatsLoading: false,
      });
    } catch (err) {
      set({ storageStatsLoading: false });
      throw err;
    }
  };
};
