import type {
  IsoDateTime,
  MountCleanupDecision,
  ProjectId,
  SessionId,
  SessionProjectMount,
} from '@goodboy/types';
import {
  markSessionMountRemoved,
  markSessionMountRemovedByPath,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cleanupMountDirectory } from '../mount-cleanup';
import type { GetFn, SetFn } from './types';

export type DetachDisposition = 'keep-files' | 'remove-clean' | 'delete-files';

export type DetachProjectInput = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly disposition?: DetachDisposition;
};

export type DetachProjectOutcome = {
  readonly worktreePath: string;
  readonly kind: MountCleanupDecision['kind'];
  readonly reason: string | null;
};

type CleanupSelection = {
  readonly keepDirectory: boolean;
  readonly mode: 'safe' | 'confirmed';
};

const selectCleanup = ({
  disposition,
}: {
  readonly disposition: DetachDisposition;
}): CleanupSelection => {
  switch (disposition) {
    case 'keep-files':
      return { keepDirectory: true, mode: 'safe' };
    case 'remove-clean':
      return { keepDirectory: false, mode: 'safe' };
    case 'delete-files':
      return { keepDirectory: false, mode: 'confirmed' };
  }
};

type DropParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly mount: SessionProjectMount;
};

const dropMountFromSession = ({ set, sessionId, mount }: DropParams): void => {
  set((state) => ({
    sessionProjectMounts: {
      ...state.sessionProjectMounts,
      [sessionId]: (state.sessionProjectMounts[sessionId] ?? []).filter(
        (candidate) => candidate !== mount,
      ),
    },
    sessionWorktrees: {
      ...state.sessionWorktrees,
      [sessionId]: (state.sessionWorktrees[sessionId] ?? []).filter(
        (path) => path !== mount.worktreePath,
      ),
    },
  }));
};

export const detachProject = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    projectId,
    disposition = 'remove-clean',
  }: DetachProjectInput): Promise<ReadonlyArray<DetachProjectOutcome>> => {
    const mounts = get().sessionProjectMounts[sessionId] ?? [];
    const detached = mounts.filter((candidate) => candidate.projectId === projectId);
    const first = detached[0];
    if (first === undefined) {
      throw new Error(`project not mounted in this session: ${projectId}`);
    }
    const project = get().projects.find((candidate) => candidate.id === projectId);
    const projectName = project?.name ?? first.mountName;
    const selection = selectCleanup({ disposition });
    const outcomes: Array<DetachProjectOutcome> = [];
    for (const mount of detached) {
      const result = await cleanupMountDirectory({
        get,
        keepDirectory: selection.keepDirectory,
        mode: selection.mode,
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
      const decision = result.decision;
      if (decision.kind === 'failed') {
        outcomes.push({
          worktreePath: mount.worktreePath,
          kind: 'failed',
          reason: decision.reason,
        });
        continue;
      }
      const kept = decision.kind === 'kept';
      const reason = decision.kind === 'kept' ? decision.reason : null;
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
      if (!kept && mountId !== undefined) {
        await markSessionMountRemoved({ db: tauriDatabase, sessionId, mountId });
      }
      if (!kept && mountId === undefined) {
        await markSessionMountRemovedByPath({
          db: tauriDatabase,
          sessionId,
          worktreePath: mount.worktreePath,
        });
      }
      dropMountFromSession({ set, sessionId, mount });
      outcomes.push({ worktreePath: mount.worktreePath, kind: decision.kind, reason });
      await get().recordSessionEvent({
        sessionId,
        kind: 'project_detached',
        payload: {
          projectId,
          projectName,
          branch: mount.branch,
          worktreePath: mount.worktreePath,
          kept,
          ...(reason != null ? { reason } : {}),
        },
      });
    }
    const remaining = get().sessionProjectMounts[sessionId] ?? [];
    const activeId = get().sessionActiveProject[sessionId] ?? null;
    const isDetached = remaining.every((candidate) => candidate.projectId !== projectId);
    const nextActiveId =
      activeId === projectId && isDetached ? (remaining[0]?.projectId ?? null) : (activeId ?? null);
    if (activeId === projectId && isDetached) {
      await updateSessionActiveProject({
        db: tauriDatabase,
        id: sessionId,
        projectId: nextActiveId,
      }).catch(() => undefined);
    }
    set((state) => {
      const worktreeRecords = isDetached ? state.sessionWorktreeRecords?.[sessionId] : undefined;
      return {
        ...(worktreeRecords !== undefined
          ? {
              sessionWorktreeRecords: {
                ...state.sessionWorktreeRecords,
                [sessionId]: worktreeRecords.filter((record) => record.projectId !== projectId),
              },
            }
          : {}),
        ...(activeId === projectId && isDetached
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
    return outcomes;
  };
};
