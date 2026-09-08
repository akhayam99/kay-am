import type { IsoDateTime, MountId, Project, Session, SessionId } from '@goodboy/types';
import {
  getSessionMount,
  listWorktreesForSession,
  unarchiveSession as unarchiveSessionInDb,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
  type SessionWorktree,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { inspectWorktree } from '../../../features/worktree/worktree';
import { invokeAgentList, invokeWorkflowsForSession } from '../../../features/workflows/workflows';
import { buildSessionProjectMounts } from '../worktrees/buildSessionProjectMounts';
import { pickActiveMount } from '../project-mounts/activeMount';
import type { GetFn, SetFn } from './types';

type VerifyParams = {
  readonly sessionId: SessionId;
  readonly rows: ReadonlyArray<SessionWorktree>;
  readonly projects: ReadonlyArray<Project>;
};

const verifyRestoredMounts = async ({
  sessionId,
  rows,
  projects,
}: VerifyParams): Promise<ReadonlyArray<SessionWorktree>> => {
  const usable: Array<SessionWorktree> = [];
  for (const row of rows) {
    const project = projects.find((candidate) => candidate.id === row.projectId);
    if (project === undefined || project.kind !== 'repo') {
      usable.push(row);
      continue;
    }
    const inspection = await inspectWorktree({
      repoPath: project.rootPath,
      worktreePath: row.worktreePath,
    }).catch(() => null);
    if (inspection === null) {
      continue;
    }
    if (inspection.kind === 'registered' && !inspection.isMain) {
      usable.push(row);
      continue;
    }
    if (inspection.kind !== 'missing') {
      continue;
    }
    const stored = await getSessionMount({
      db: tauriDatabase,
      sessionId,
      mountId: row.id as MountId,
    }).catch(() => null);
    const mountRevision = stored?.revision ?? 0;
    await updateSessionMountLifecycle({
      db: tauriDatabase,
      sessionId,
      mountId: row.id as MountId,
      worktreePath: null,
      isAttached: false,
      diskState: 'missing',
      expectedRevision: mountRevision,
      updatedAt: new Date().toISOString() as IsoDateTime,
    }).catch(() => undefined);
  }
  return usable;
};

export const unarchiveTask = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId) => {
    const archivedList = Object.values(get().archivedSessions).flat();
    const prev = archivedList.find((s) => s.id === sessionId);
    if (!prev) {
      return;
    }
    const workspaceId = prev.workspaceId;
    const { archivedAt: _drop, ...restored } = prev;
    const restoredSession = restored as Session;

    set((state) => {
      const cached = state.archivedSessions[workspaceId];
      const nextArchived = cached
        ? { ...state.archivedSessions, [workspaceId]: cached.filter((s) => s.id !== sessionId) }
        : state.archivedSessions;
      const isCurrentWorkspace = state.currentWorkspaceId === workspaceId;
      return {
        sessions: isCurrentWorkspace ? [restoredSession, ...state.sessions] : state.sessions,
        archivedSessions: nextArchived,
      };
    });

    try {
      await unarchiveSessionInDb(tauriDatabase, sessionId);
    } catch (err) {
      set((state) => {
        const cached = state.archivedSessions[workspaceId];
        const nextArchived = cached
          ? { ...state.archivedSessions, [workspaceId]: [prev, ...cached] }
          : state.archivedSessions;
        return {
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          archivedSessions: nextArchived,
        };
      });
      throw err;
    }

    if (get().currentWorkspaceId !== workspaceId) {
      return;
    }
    try {
      const [storedRows, runs, attachedWorkflows] = await Promise.all([
        listWorktreesForSession(tauriDatabase, sessionId),
        invokeAgentList(sessionId),
        invokeWorkflowsForSession(sessionId).catch(() => []),
      ]);
      const projects = get().projects.filter((project) => project.workspaceId === workspaceId);
      const worktreeRows = await verifyRestoredMounts({ sessionId, rows: storedRows, projects });
      const mounts = buildSessionProjectMounts({ projects, rows: worktreeRows });
      const storedActiveProjectId = restoredSession.activeProjectId;
      const hasStoredActiveProjectId =
        storedActiveProjectId != null &&
        mounts.some((mount) => mount.projectId === storedActiveProjectId);
      if (storedActiveProjectId != null && !hasStoredActiveProjectId) {
        await updateSessionActiveProject({ db: tauriDatabase, id: sessionId, projectId: null });
      }
      let restoredWithValidActiveMount = restoredSession;
      if (storedActiveProjectId != null && !hasStoredActiveProjectId) {
        const { activeProjectId: _drop, ...validSession } = restoredSession;
        restoredWithValidActiveMount = validSession;
      }
      const activeMount = pickActiveMount({
        mounts,
        selectedMountId: null,
        storedMountId: restoredSession.activeMountId,
        activeProjectId: hasStoredActiveProjectId ? storedActiveProjectId : null,
      });
      const activeMountId = activeMount?.mountId ?? null;
      set((state) => {
        const nextWorktrees = { ...state.sessionWorktrees };
        const nextBranches = { ...state.sessionBranches };
        const nextActiveProject = { ...state.sessionActiveProject };
        if (hasStoredActiveProjectId) {
          nextActiveProject[sessionId] = storedActiveProjectId;
        } else {
          delete nextActiveProject[sessionId];
        }
        if (worktreeRows.length > 0) {
          nextWorktrees[sessionId] = worktreeRows.map((r) => r.worktreePath);
        }
        if (activeMount === null) {
          delete nextBranches[sessionId];
        } else {
          nextBranches[sessionId] = activeMount.branch;
        }
        return {
          sessions: state.sessions.map((candidate) =>
            candidate.id === sessionId ? restoredWithValidActiveMount : candidate,
          ),
          sessionWorktrees: nextWorktrees,
          sessionWorktreeRecords: { ...state.sessionWorktreeRecords, [sessionId]: worktreeRows },
          sessionProjectMounts: { ...state.sessionProjectMounts, [sessionId]: mounts },
          sessionActiveProject: nextActiveProject,
          sessionActiveMount: { ...state.sessionActiveMount, [sessionId]: activeMountId },
          sessionBranches: nextBranches,
          sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: runs },
          sessionWorkflows: { ...state.sessionWorkflows, [sessionId]: attachedWorkflows },
        };
      });
    } catch {}
    void get()
      .reconcileOrphanWorktrees()
      .catch(() => undefined);
  };
};
