import {
  updateSessionActiveMount,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
} from '@goodboy/db';
import type { IsoDateTime, ProjectId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { cleanupMountDirectory } from '../mount-cleanup';
import { mountError } from './mountErrors';
import { withRepositoryAndMountLock } from './mountLocks';
import {
  beginMountOperation,
  markMountOperationUncertain,
  succeedMountOperation,
} from './mountOperations';
import { applyMountViews, loadMountViews, requireMountView } from './mountViews';
import { clearMountBranchObservation } from './mountBranchObservations';
import { requireMountContext } from './requireMountContext';
import type { GetFn, SetFn, UnmountMountInput, UnmountMountResult } from './types';

export const unmountMount = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    keepDirectory = false,
    requestId,
  }: UnmountMountInput): Promise<UnmountMountResult> => {
    const views = await loadMountViews({ get, sessionId });
    const view = requireMountView({ views, mountId });
    const { project } = requireMountContext({ get, sessionId, projectId: view.projectId });
    return withRepositoryAndMountLock({
      repoRoot: view.repoRoot,
      mountKey: `${sessionId}:${mountId}`,
      run: async () => {
        const operation = await beginMountOperation({
          sessionId,
          requestId: requestId ?? crypto.randomUUID(),
          kind: 'unmount',
          mountId,
          expectedRevision: view.revision,
          input: { repoRoot: view.repoRoot, worktreePath: view.worktreePath, keepDirectory },
        });
        const worktreePath = view.worktreePath;
        const cleanup =
          worktreePath === null
            ? null
            : await cleanupMountDirectory({
                get,
                target: {
                  sessionId,
                  mountId,
                  projectId: view.projectId,
                  repoRoot: view.repoRoot,
                  worktreePath,
                  branch: view.branch,
                  diskState: view.diskState,
                  isRepoProject: project.kind === 'repo',
                },
                keepDirectory,
              });
        const decision = cleanup?.decision ?? null;
        const removal = {
          kept: decision?.kind === 'kept',
          reason: decision?.kind === 'kept' ? decision.reason : null,
          diskState: cleanup?.diskState ?? 'removed',
        };
        const nextPath = removal.kept ? worktreePath : null;
        const written = await updateSessionMountLifecycle({
          db: tauriDatabase,
          sessionId,
          mountId,
          worktreePath: nextPath,
          isAttached: false,
          diskState: removal.diskState,
          expectedRevision: view.revision,
          updatedAt: new Date().toISOString() as IsoDateTime,
        });
        if (!written) {
          await markMountOperationUncertain({ operation, errorCode: 'revision-conflict' });
          throw mountError({
            code: 'revision-conflict',
            message: 'the mount changed while unmounting it',
            mountId,
          });
        }
        await succeedMountOperation({ operation });
        clearMountBranchObservation({ set, sessionId, mountId });
        const nextViews = await loadMountViews({ get, sessionId });
        const remaining = nextViews.filter(
          (candidate) => candidate.isAttached && candidate.worktreePath !== null,
        );
        const session = get().sessions.find((candidate) => candidate.id === sessionId);
        if (session?.activeMountId === mountId) {
          await updateSessionActiveMount({
            db: tauriDatabase,
            sessionId,
            mountId: null,
          }).catch(() => undefined);
        }
        const activeProjectId = get().sessionActiveProject[sessionId] ?? null;
        const keepsActiveProject = remaining.some(
          (candidate) => candidate.projectId === activeProjectId,
        );
        const nextActiveProjectId: ProjectId | null = keepsActiveProject
          ? activeProjectId
          : (remaining[0]?.projectId ?? null);
        if (nextActiveProjectId !== activeProjectId) {
          await updateSessionActiveProject({
            db: tauriDatabase,
            id: sessionId,
            projectId: nextActiveProjectId,
          }).catch(() => undefined);
        }
        applyMountViews({ set, sessionId, views: nextViews });
        set((state) => {
          const activeProjects = { ...state.sessionActiveProject };
          if (nextActiveProjectId === null) {
            delete activeProjects[sessionId];
          } else {
            activeProjects[sessionId] = nextActiveProjectId;
          }
          return {
            sessionActiveProject: activeProjects,
            sessions: state.sessions.map((candidate) => {
              if (candidate.id !== sessionId) {
                return candidate;
              }
              const { activeMountId: _mount, activeProjectId: _project, ...rest } = candidate;
              return {
                ...rest,
                ...(candidate.activeMountId === mountId
                  ? {}
                  : { activeMountId: candidate.activeMountId }),
                ...(nextActiveProjectId === null ? {} : { activeProjectId: nextActiveProjectId }),
              };
            }),
          };
        });
        await get().recordSessionEvent({
          sessionId,
          kind: 'project_detached',
          payload: {
            projectId: view.projectId,
            projectName: view.mountName,
            branch: view.branch,
            ...(worktreePath !== null ? { worktreePath } : {}),
            kept: removal.kept,
            ...(removal.reason !== null ? { reason: removal.reason } : {}),
          },
        });
        void get()
          .reconcileOrphanWorktrees()
          .catch(() => undefined);
        return {
          mount: requireMountView({ views: nextViews, mountId }),
          kept: removal.kept,
          reason: removal.reason,
        };
      },
    });
  };
};
