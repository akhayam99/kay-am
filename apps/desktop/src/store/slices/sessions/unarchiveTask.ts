import type { Session, SessionId } from '@goodboy/types';
import {
  listWorktreesForSession,
  unarchiveSession as unarchiveSessionInDb,
  updateSessionActiveProject,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { invokeAgentList, invokeWorkflowsForSession } from '../../../features/workflows/workflows';
import { buildSessionProjectMounts } from '../worktrees/buildSessionProjectMounts';
import { pickActiveMount } from '../project-mounts/activeMount';
import { verifyAvailableWorktrees } from '../project-mounts/verifyAvailableWorktrees';
import type { GetFn, SetFn } from './types';

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
      const worktreeRows = await verifyAvailableWorktrees({
        sessionId,
        candidates: storedRows,
        projects,
      });
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
