import type {
  Agent,
  IsoDateTime,
  MountId,
  ProjectId,
  ProviderRunId,
  SessionExternalTask,
  Workflow,
  WorkspaceId,
} from '@goodboy/types';
import {
  listAgentsForSessions,
  listExternalTasksForWorkspace,
  listProjectsForWorkspace,
  listSessionsForWorkspace,
  listWorktreesForSessions,
  setSetting as dbSetSetting,
  summarizeWorkspaceProviderTelemetry,
  summarizeWorkspaceTelemetry,
  touchWorkspaceLastAccessed,
  updateSessionActiveProject,
} from '@goodboy/db';
import type { SessionWorktree } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelTurn, listLiveRunIds } from '../../../features/chat/turn';
import { isMainWindow } from '../../../features/workspace/window';
import { invokeBudgetAlertsList, invokeBudgetRuleList } from '../../../features/budget/budget';
import { invokeSkillList } from '../../../features/skills/skills';
import {
  invokeWorkflowList,
  invokeWorkflowsForSession,
  invokeStepDefList,
} from '../../../features/workflows/workflows';
import type { AgentKind } from '../../../features/session/agent-kind';
import {
  SETTING_LAST_SESSION_ID,
  SETTING_LAST_WORKSPACE_ID,
} from '../../../features/settings/settings';
import { buildProviderSpendBreakdown } from '../budget';
import { reconcileLoadedAgent, reconcileLoadedSessions } from '../sessions/reconcileSessionRuns';
import { buildSessionProjectMounts } from '../worktrees/buildSessionProjectMounts';
import { pickActiveMount } from '../project-mounts/activeMount';
import { verifyAvailableWorktrees } from '../project-mounts/verifyAvailableWorktrees';
import { clearPendingTurnEvents } from '../transcripts/buffer';
import type { GetFn, SetFn } from './types';

export const setCurrentWorkspace = (set: SetFn, get: GetFn) => {
  return async (id: WorkspaceId | null) => {
    const runningSessions = get().sessions.filter((s) => s.state.kind === 'running');
    await Promise.all(
      runningSessions.map((s) =>
        cancelTurn((s.state as { kind: 'running'; runId: ProviderRunId }).runId).catch(() => {}),
      ),
    );

    clearPendingTurnEvents();
    set({
      currentWorkspaceId: id,
      currentSessionId: null,
      sessions: [],
      archivedSessions: {},
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
      sessionBranches: {},
      sessionExternalTasks: {},
      sessionPhaseRuns: {},
      selectedAgentId: {},
      agentRunHistory: {},
      agentTurnState: {},
      sessionBudgets: {},
      summarizerStatus: {},
      budgetAlerts: [],
      unknownPayloadCounts: {},
      sessionLoading: {},
      boardReady: false,
    });
    if (id != null) {
      const touchNow = new Date().toISOString() as IsoDateTime;
      set((state) => ({
        workspaces: state.workspaces.map((w) =>
          w.id === id ? { ...w, lastAccessedAt: touchNow } : w,
        ),
      }));
      touchWorkspaceLastAccessed({ db: tauriDatabase, id }).catch(() => undefined);

      const projects = await listProjectsForWorkspace({ db: tauriDatabase, workspaceId: id });
      set((state) => ({
        projects: [...state.projects.filter((project) => project.workspaceId !== id), ...projects],
      }));
      await get()
        .loadIntegrations(id)
        .catch(() => undefined);

      const tWsLoad = performance.now();
      const loadedSessions = await listSessionsForWorkspace(tauriDatabase, id);
      const liveRunIds = await listLiveRunIds();
      const recoveryNow = new Date().toISOString() as IsoDateTime;
      const sessions = await reconcileLoadedSessions({
        sessions: loadedSessions,
        liveRunIds,
        now: recoveryNow,
      });
      const sessionIds = sessions.map((s) => s.id);
      const [loadedWorktreesBySession, agentsBySession, externalTasks] = await Promise.all([
        listWorktreesForSessions(tauriDatabase, sessionIds),
        listAgentsForSessions(tauriDatabase, sessionIds),
        listExternalTasksForWorkspace({ db: tauriDatabase, workspaceId: id }),
      ]);
      const worktreesBySession = loadedWorktreesBySession;
      const sessionWorktrees: Record<string, ReadonlyArray<string>> = {};
      const sessionWorktreeRecords: Record<string, ReadonlyArray<SessionWorktree>> = {};
      const sessionProjectMounts: Record<string, ReturnType<typeof buildSessionProjectMounts>> = {};
      const sessionActiveProject: Record<string, ProjectId> = {};
      const sessionActiveMount: Record<string, MountId | null> = {};
      const sessionBranches: Record<string, string> = {};
      const sessionPhaseRuns: Record<string, ReadonlyArray<Agent>> = {};
      const kindOverridesFromDb: Record<string, AgentKind> = {};
      const invalidActiveMountSessionIds = new Set<string>();
      for (const s of sessions) {
        const rows = await verifyAvailableWorktrees({
          sessionId: s.id,
          candidates: worktreesBySession.get(s.id) ?? [],
          projects,
        });
        sessionWorktreeRecords[s.id] = rows;
        const mounts = buildSessionProjectMounts({ projects, rows });
        sessionProjectMounts[s.id] = mounts;
        if (
          s.activeProjectId != null &&
          mounts.some((mount) => mount.projectId === s.activeProjectId)
        ) {
          sessionActiveProject[s.id] = s.activeProjectId;
        }
        if (
          s.activeProjectId != null &&
          mounts.every((mount) => mount.projectId !== s.activeProjectId)
        ) {
          invalidActiveMountSessionIds.add(s.id);
          await updateSessionActiveProject({
            db: tauriDatabase,
            id: s.id,
            projectId: null,
          });
        }
        const activeMount = pickActiveMount({
          mounts,
          selectedMountId: null,
          storedMountId: s.activeMountId,
          activeProjectId: s.activeProjectId,
        });
        sessionActiveMount[s.id] = activeMount?.mountId ?? null;
        if (rows.length > 0) {
          sessionWorktrees[s.id] = rows.map((r) => r.worktreePath);
        }
        if (activeMount !== null) {
          sessionBranches[s.id] = activeMount.branch;
        }
        const runs = await Promise.all(
          (agentsBySession.get(s.id) ?? []).map((agent) =>
            reconcileLoadedAgent({ agent, liveRunIds }),
          ),
        );
        sessionPhaseRuns[s.id] = runs;
        for (const run of runs) {
          if (run.kind) {
            kindOverridesFromDb[run.id] = run.kind as AgentKind;
          }
        }
      }
      const sessionsWithValidActiveMounts = sessions.map((session) => {
        if (!invalidActiveMountSessionIds.has(session.id)) {
          return session;
        }
        const { activeProjectId: _drop, ...validSession } = session;
        return validSession;
      });
      const externalTasksMap: Record<string, SessionExternalTask[]> = {};
      for (const task of externalTasks) {
        externalTasksMap[task.sessionId] = [...(externalTasksMap[task.sessionId] ?? []), task];
      }
      for (const s of sessions) {
        externalTasksMap[s.id] = externalTasksMap[s.id] ?? [];
      }
      set((state) => ({
        sessions: sessionsWithValidActiveMounts,
        sessionWorktrees,
        sessionWorktreeRecords,
        sessionProjectMounts,
        sessionActiveProject,
        sessionActiveMount,
        sessionBranches,
        sessionPhaseRuns,
        agentKindOverride: { ...state.agentKindOverride, ...kindOverridesFromDb },
        sessionExternalTasks: { ...state.sessionExternalTasks, ...externalTasksMap },
      }));
      if (get().currentWorkspaceId === id && Object.keys(sessionWorktrees).length === 0) {
        set({ boardReady: true });
      }
      if (import.meta.env.DEV) {
        console.log(`[perf] workspace:firstPaint ${(performance.now() - tWsLoad).toFixed(0)}ms`);
      }

      void (async (): Promise<void> => {
        const tWsDefer = performance.now();
        const [
          workspaceSummary,
          providerSummaries,
          budgetRules,
          budgetAlerts,
          skills,
          phaseTemplates,
          stepLibrary,
        ] = await Promise.all([
          summarizeWorkspaceTelemetry(tauriDatabase, id).catch(() => null),
          summarizeWorkspaceProviderTelemetry(tauriDatabase, id).catch(() => []),
          invokeBudgetRuleList().catch(() => []),
          invokeBudgetAlertsList().catch(() => []),
          invokeSkillList(id).catch(() => []),
          invokeWorkflowList(id).catch(() => []),
          invokeStepDefList(id).catch(() => []),
        ]);
        if (get().currentWorkspaceId !== id) {
          return;
        }
        const workflowById = new Map(phaseTemplates.map((t) => [t.id, t]));
        const extraById = new Map<string, Workflow>();
        const needBackfill = get().sessions.filter((s) =>
          s.workflowRuns.some((r) => !workflowById.has(r.workflowId)),
        );
        await Promise.all(
          needBackfill.map(async (s) => {
            const attached = await invokeWorkflowsForSession(s.id).catch(() => []);
            for (const wf of attached)
              if (!workflowById.has(wf.id)) {
                extraById.set(wf.id, wf);
              }
          }),
        );
        const resolveById = new Map<string, Workflow>([...workflowById, ...extraById]);
        const sessionWorkflows: Record<string, ReadonlyArray<Workflow>> = {};
        for (const s of get().sessions) {
          const attached = [...new Set(s.workflowRuns.map((r) => r.workflowId))]
            .map((wid) => resolveById.get(wid) ?? null)
            .filter((w): w is Workflow => w !== null);
          sessionWorkflows[s.id] = attached;
        }
        const mergedTemplates = [...phaseTemplates, ...extraById.values()];
        set((state) => ({
          sessionWorkflows,
          workspaceSummary,
          providerSpendBreakdown: buildProviderSpendBreakdown(providerSummaries, budgetRules),
          budgetAlerts,
          skills: { ...state.skills, [id]: skills },
          phaseTemplates: { ...state.phaseTemplates, [id]: mergedTemplates },
          stepLibrary: { ...state.stepLibrary, [id]: stepLibrary },
        }));
        for (const session of get().sessions) {
          const hasQueuedChain = session.workflowRuns.some(
            (run) =>
              run.discardedAt == null &&
              run.triggerMode === 'after_run' &&
              run.chainAfterId != null,
          );
          if (!hasQueuedChain) {
            continue;
          }
          void get().maybeAutoAdvanceWorkflow(session.id);
        }
        if (import.meta.env.DEV) {
          console.log(`[perf] workspace:deferred ${(performance.now() - tWsDefer).toFixed(0)}ms`);
        }
      })();
      void get().loadWorkspaceOverrides(id);
    } else {
      set({ providerSpendBreakdown: [] });
    }
    if (isMainWindow()) {
      void dbSetSetting(tauriDatabase, SETTING_LAST_WORKSPACE_ID, id ?? '');
      void dbSetSetting(tauriDatabase, SETTING_LAST_SESSION_ID, '');
    }
    void get().refreshUnreadWorkspaces();
    const sessionsNow = get().sessions;
    if (sessionsNow.length === 1 && get().currentSessionId === null) {
      await get().setCurrentSession(sessionsNow[0]!.id);
    }
  };
};
