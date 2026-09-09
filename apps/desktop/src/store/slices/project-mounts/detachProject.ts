import type {
  IsoDateTime,
  MountId,
  ProjectId,
  SessionId,
  SessionProjectMount,
} from '@goodboy/types';
import {
  deleteSessionWorktreeForProject,
  markSessionMountsRemoved,
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

type Outcome = {
  readonly mount: SessionProjectMount;
  readonly kept: boolean;
  readonly reason: string | null;
};

export const detachProject = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, projectId }: DetachProjectInput): Promise<void> => {
    const mounts = get().sessionProjectMounts[sessionId] ?? [];
    const first = mounts.find((candidate) => candidate.projectId === projectId);
    if (first === undefined) {
      throw new Error(`project not mounted in this session: ${projectId}`);
    }
    const detached = mounts.filter((candidate) => candidate.projectId === projectId);
    const project = get().projects.find((candidate) => candidate.id === projectId);
    const projectName = project?.name ?? first.mountName;
    const outcomes: Array<Outcome> = [];
    const removedMountIds: Array<MountId> = [];
    let hasUnidentifiedRemoval = false;
    for (const mount of detached) {
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
      outcomes.push({
        mount,
        kept,
        reason: result.decision.kind === 'kept' ? result.decision.reason : null,
      });
      const mountId = mount.mountId;
      const revision = mount.revision;
      if (kept) {
        if (mountId !== undefined && revision !== undefined) {
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
        continue;
      }
      if (mountId === undefined) {
        hasUnidentifiedRemoval = true;
        continue;
      }
      removedMountIds.push(mountId);
    }
    if (removedMountIds.length > 0) {
      await markSessionMountsRemoved({ db: tauriDatabase, sessionId, mountIds: removedMountIds });
    }
    const keptCount = outcomes.filter((outcome) => outcome.kept).length;
    if (hasUnidentifiedRemoval && keptCount === 0) {
      await deleteSessionWorktreeForProject({ db: tauriDatabase, sessionId, projectId });
    }
    const remaining = mounts.filter((candidate) => candidate.projectId !== projectId);
    const detachedPaths = new Set(detached.map((candidate) => candidate.worktreePath));
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
    for (const outcome of outcomes) {
      await get().recordSessionEvent({
        sessionId,
        kind: 'project_detached',
        payload: {
          projectId,
          projectName,
          branch: outcome.mount.branch,
          worktreePath: outcome.mount.worktreePath,
          kept: outcome.kept,
          ...(outcome.reason != null ? { reason: outcome.reason } : {}),
        },
      });
    }
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
            (path) => !detachedPaths.has(path),
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
