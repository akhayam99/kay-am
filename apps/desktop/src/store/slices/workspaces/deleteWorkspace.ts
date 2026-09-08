import type { IsoDateTime, ProviderRunId, SessionId, WorkspaceId } from '@goodboy/types';
import { disconnectWorkspace as disconnectWorkspaceInDb } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelTurn } from '../../../features/chat/turn';
import { invokeTerminalClose } from '../../../features/terminal/terminal';
import { clearPendingTurnEvents } from '../transcripts/buffer';
import type { GetFn, SetFn } from './types';

export const deleteWorkspace = (set: SetFn, get: GetFn) => {
  return async (id: WorkspaceId) => {
    const state = get();
    const workspace = state.workspaces.find((w) => w.id === id);
    if (!workspace) {
      throw new Error(`workspace not found: ${id}`);
    }

    const wasCurrentWorkspace = state.currentWorkspaceId === id;
    if (wasCurrentWorkspace) {
      const runningSessions = state.sessions.filter((s) => s.state.kind === 'running');
      await Promise.all(
        runningSessions.map((s) =>
          cancelTurn((s.state as { kind: 'running'; runId: ProviderRunId }).runId).catch(
            () => undefined,
          ),
        ),
      );
      const termSessions = state.sessions.filter(
        (s) => state.terminalSessions[s.id as SessionId] === 'open',
      );
      void Promise.all(
        termSessions.map((s) => invokeTerminalClose(s.id as SessionId).catch(() => undefined)),
      );
    }

    const now = new Date().toISOString() as IsoDateTime;
    const prevWorkspaces = state.workspaces;

    if (wasCurrentWorkspace) {
      clearPendingTurnEvents();
    }
    set((s) => {
      const nextArchived = { ...s.archivedSessions };
      const workspaceIntegrations = { ...s.workspaceIntegrations };
      const projectScripts = { ...s.projectScripts };
      const workspaceOverrides = { ...s.workspaceOverrides };
      delete nextArchived[id];
      delete workspaceIntegrations[id];
      delete projectScripts[id];
      delete workspaceOverrides[id];
      return {
        workspaces: s.workspaces.filter((w) => w.id !== id),
        projects: s.projects.filter((project) => project.workspaceId !== id),
        archivedSessions: nextArchived,
        workspaceIntegrations,
        projectScripts,
        workspaceOverrides,
        ...(wasCurrentWorkspace
          ? {
              currentWorkspaceId: null,
              currentSessionId: null,
              sessions: [],
              sessionSummary: null,
              workspaceSummary: null,
              transcripts: {},
              messages: {},
              sessionTelemetry: {},
              sessionSlots: {},
              slotHistory: {},
              slotHistoryCounts: {},
              sessionSlotsLoad: {},
              sessionWorktrees: {},
              sessionProjectMounts: {},
              sessionActiveProject: {},
              sessionActiveMount: {},
              sessionPhaseRuns: {},
              selectedAgentId: {},
              agentRunHistory: {},
              agentTurnState: {},
              sessionBudgets: {},
              summarizerStatus: {},
              budgetAlerts: [],
              unknownPayloadCounts: {},
              terminalSessions: {},
            }
          : {}),
      };
    });

    try {
      await disconnectWorkspaceInDb({ db: tauriDatabase, id, at: now });
    } catch (err) {
      set((s) => ({
        workspaces: prevWorkspaces,
        ...(wasCurrentWorkspace ? { currentWorkspaceId: id } : {}),
      }));
      throw err;
    }
    void get().emitNotification(
      'workspace-deleted',
      'info',
      `Workspace disconnected: ${workspace.name}`,
      'Re-add the same path to bring it back with all its sessions.',
    );
  };
};
