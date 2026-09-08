import type { IsoDateTime, ProjectId, SessionId } from '@goodboy/types';
import {
  deleteSessionWorktreeForProject,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cleanupMountDirectory } from '../mount-cleanup';
import type { GetFn, SetFn } from './types';

export type DetachProjectInput = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
};

export const detachProject = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, projectId }: DetachProjectInput): Promise<void> => {
    const mounts = get().sessionProjectMounts[sessionId] ?? [];
    const mount = mounts.find((candidate) => candidate.projectId === projectId);
    if (mount === undefined) {
      throw new Error(`project not mounted in this session: ${projectId}`);
    }
    const project = get().projects.find((candidate) => candidate.id === projectId);
    const projectName = project?.name ?? mount.mountName;
    const result = await cleanupMountDirectory({
      get,
      target: {
        sessionId,
        mountId: mount.mountId ?? null,
        projectId,
        repoRoot: mount.repoRoot,
        worktreePath: mount.worktreePath,
        branch: mount.branch,
        diskState: mount.diskState ?? 'unchecked',
        isRepoProject: project?.kind === 'repo',
      },
    });
    const kept = result.decision.kind === 'kept';
    const keptReason = result.decision.kind === 'kept' ? result.decision.reason : null;
    const mountId = mount.mountId;
    const revision = mount.revision;
    if (kept && mountId !== undefined && revision !== undefined) {
      await updateSessionMountLifecycle({
        db: tauriDatabase,
        sessionId,
        mountId,
        worktreePath: mount.worktreePath,
        isAttached: false,
        diskState: result.diskState,
        expectedRevision: revision,
        updatedAt: new Date().toISOString() as IsoDateTime,
      });
    }
    if (!kept) {
      await deleteSessionWorktreeForProject({ db: tauriDatabase, sessionId, projectId });
    }
    const remaining = mounts.filter((candidate) => candidate.projectId !== projectId);
    const activeId = get().sessionActiveProject[sessionId] ?? null;
    const nextActiveId =
      activeId === projectId ? (remaining[0]?.projectId ?? null) : (activeId ?? null);
    if (activeId === projectId) {
      await updateSessionActiveProject({
        db: tauriDatabase,
        id: sessionId,
        projectId: nextActiveId,
      }).catch(() => undefined);
    }
    await get().recordSessionEvent({
      sessionId,
      kind: 'project_detached',
      payload: {
        projectId,
        projectName,
        branch: mount.branch,
        worktreePath: mount.worktreePath,
        kept,
        ...(keptReason != null ? { reason: keptReason } : {}),
      },
    });
    set((state) => {
      const worktreeRecords = state.sessionWorktreeRecords?.[sessionId];
      return {
        sessionProjectMounts: {
          ...state.sessionProjectMounts,
          [sessionId]: remaining,
        },
        sessionWorktrees: {
          ...state.sessionWorktrees,
          [sessionId]: (state.sessionWorktrees[sessionId] ?? []).filter(
            (path) => path !== mount.worktreePath,
          ),
        },
        ...(worktreeRecords !== undefined
          ? {
              sessionWorktreeRecords: {
                ...state.sessionWorktreeRecords,
                [sessionId]: worktreeRecords.filter((record) => record.projectId !== projectId),
              },
            }
          : {}),
        ...(activeId === projectId
          ? {
              sessionActiveProject: Object.fromEntries(
                Object.entries(state.sessionActiveProject)
                  .filter(([key]) => key !== sessionId)
                  .concat(nextActiveId === null ? [] : [[sessionId, nextActiveId]]),
              ),
              sessions: state.sessions.map((candidate) => {
                if (candidate.id !== sessionId) {
                  return candidate;
                }
                if (nextActiveId === null) {
                  const { activeProjectId, ...rest } = candidate;
                  return rest;
                }
                return { ...candidate, activeProjectId: nextActiveId };
              }),
            }
          : {}),
      };
    });
  };
};
