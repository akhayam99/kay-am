import { updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime, MountDiskState, WorktreeInspection } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { inspectWorktree } from '../../../features/worktree/worktree';
import { mountError } from './mountErrors';
import { applyMountViews, loadMountViews, requireMountView } from './mountViews';
import type { GetFn, InspectMountResult, MountKeyInput, SetFn } from './types';

const diskStateFor = ({
  inspection,
}: {
  readonly inspection: WorktreeInspection;
}): MountDiskState => {
  switch (inspection.kind) {
    case 'registered':
      return 'present';
    case 'missing':
      return 'missing';
    case 'foreign-directory':
      return 'missing';
    case 'repository-unavailable':
      return 'unchecked';
    default: {
      const exhaustive: never = inspection;
      return exhaustive;
    }
  }
};

export const inspectMount = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId }: MountKeyInput): Promise<InspectMountResult> => {
    const views = await loadMountViews({ get, sessionId });
    const view = requireMountView({ views, mountId });
    const path = view.worktreePath ?? view.lastWorktreePath;
    if (path === null) {
      throw mountError({
        code: 'unknown-state',
        message: 'this mount has never had a directory',
        mountId,
      });
    }
    const inspection = await inspectWorktree({ repoPath: view.repoRoot, worktreePath: path });
    const diskState = diskStateFor({ inspection });
    if (diskState !== view.diskState) {
      await updateSessionMountLifecycle({
        db: tauriDatabase,
        sessionId,
        mountId,
        worktreePath: view.worktreePath,
        isAttached: view.isAttached,
        diskState,
        expectedRevision: view.revision,
        updatedAt: new Date().toISOString() as IsoDateTime,
      });
    }
    const nextViews = await loadMountViews({ get, sessionId });
    applyMountViews({ set, sessionId, views: nextViews });
    return { mount: requireMountView({ views: nextViews, mountId }), inspection };
  };
};
