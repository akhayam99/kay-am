import type { IsoDateTime, Message, ProviderRunId, SessionId, TurnState } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import {
  listAgentRunIdsForSession,
  listOpenQuestionsForSession,
  listTelemetryForSession,
  setSetting as dbSetSetting,
  summarizeSessionTelemetry,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { invokeAgentList } from '../../../features/workflows/workflows';
import { listPlansForSession as invokeListPlansForSession } from '../../../features/plans/plans';
import type { AgentKind } from '../../../features/session/agent-kind';
import { SETTING_LAST_SESSION_ID } from '../../../features/settings/settings';
import { EMPTY_LOADING } from '../../session-mutators';
import type { SessionLoadingFlags } from '../../types';
import type { GetFn, SetFn } from './types';

export const setCurrentSession = (set: SetFn, get: GetFn) => {
  return async (id: SessionId | null) => {
    if (get().currentSessionId === id) {
      if (id !== null) {
        await get().ensureSessionSlots(id);
      }
      return;
    }
    const tSwitch = performance.now();
    const stateNow = get();
    const cached = id
      ? {
          telemetry: stateNow.sessionTelemetry[id] !== undefined,
          slots: stateNow.sessionSlotsLoad[id] === 'loaded',
          plans: stateNow.sessionPlans[id] !== undefined,
          agents: stateNow.sessionPhaseRuns[id] !== undefined,
        }
      : null;
    const initialLoading: SessionLoadingFlags = id
      ? {
          agents: cached ? !cached.agents : true,
          transcript: false,
          telemetry: cached ? !cached.telemetry : true,
          slots: cached ? !cached.slots : true,
          plans: cached ? !cached.plans : true,
          summary: true,
        }
      : EMPTY_LOADING;
    set((state) => ({
      currentSessionId: id,
      sessionSummary: null,
      sessionLoading: id ? { ...state.sessionLoading, [id]: initialLoading } : state.sessionLoading,
      activeLens: id ? { ...state.activeLens, [id]: null } : state.activeLens,
      selectedAgentId: id ? { ...state.selectedAgentId, [id]: null } : state.selectedAgentId,
    }));
    void dbSetSetting(tauriDatabase, SETTING_LAST_SESSION_ID, id ?? '');
    if (!id) {
      return;
    }
    void get().loadSessionOverrides(id);
    const perf = (op: string) => {
      const t0 = performance.now();
      return () => {
        if (import.meta.env.DEV) {
          console.log(`[perf] session:${op} ${(performance.now() - t0).toFixed(0)}ms`);
        }
      };
    };
    if (import.meta.env.DEV) {
      console.log(`[perf] session:switchSync ${(performance.now() - tSwitch).toFixed(0)}ms`);
    }

    const markDone = (key: keyof SessionLoadingFlags): void => {
      set((state) => {
        if (state.currentSessionId !== id) {
          return {};
        }
        const current = state.sessionLoading[id] ?? EMPTY_LOADING;
        return {
          sessionLoading: { ...state.sessionLoading, [id]: { ...current, [key]: false } },
        };
      });
    };

    const endSummary = perf('summary');
    void summarizeSessionTelemetry(tauriDatabase, id)
      .then((summary) => {
        set((state) => (state.currentSessionId === id ? { sessionSummary: summary } : {}));
      })
      .catch(() => {})
      .finally(() => {
        endSummary();
        markDone('summary');
      });

    if (get().sessionBranches[id]) {
      void get()
        .refreshSessionPr(id)
        .then(() => get().refreshSessionPrDetail(id));
    }

    if (!cached?.telemetry) {
      const endTelemetry = perf('telemetry');
      void listTelemetryForSession(tauriDatabase, id)
        .then((telemetry) => {
          set((state) => ({
            sessionTelemetry: { ...state.sessionTelemetry, [id]: telemetry },
          }));
        })
        .catch((error: unknown) => {
          console.error(`[telemetry] load failed for session ${id}`, formatError(error));
        })
        .finally(() => {
          endTelemetry();
          markDone('telemetry');
        });
    }

    if (!cached?.slots) {
      const endSlots = perf('slots');
      void get()
        .ensureSessionSlots(id)
        .finally(() => endSlots());
    }

    void get().loadGoalAttachments({ type: 'session', id });

    void listOpenQuestionsForSession(tauriDatabase, id, 'open')
      .then((qs) => {
        set((state) => ({
          sessionOpenQuestions: { ...state.sessionOpenQuestions, [id]: qs },
        }));
      })
      .catch(() => {});

    if (!cached?.plans) {
      const endPlans = perf('plans');
      void invokeListPlansForSession(id)
        .then((plans) => {
          set((state) => ({
            sessionPlans: { ...state.sessionPlans, [id]: plans },
          }));
        })
        .catch((error: unknown) => {
          console.error(`[plans] load failed for session ${id}`, formatError(error));
        })
        .finally(() => {
          endPlans();
          markDone('plans');
        });
    }

    if (cached?.agents === true) {
      void get()
        .loadResolveSession({ sessionId: id })
        .catch((error: unknown) => {
          console.error('[resolve] load failed', formatError(error));
        });
    }
    if (cached?.agents !== true) {
      const endAgents = perf('agents+runIds');
      const endPhaseRunList = perf('agents:phaseRunList');
      const endRunIds = perf('agents:runIds');
      void Promise.all([
        invokeAgentList(id).finally(() => endPhaseRunList()),
        listAgentRunIdsForSession(tauriDatabase, id).finally(() => endRunIds()),
      ])
        .then(([agents, agentRunIds]) => {
          const seededHistory: Record<string, ReadonlyArray<ProviderRunId>> = {};
          const seededTurnState: Record<string, TurnState> = {};
          const session = get().sessions.find((s) => s.id === id);
          const sessionState =
            session?.state ??
            ({ kind: 'idle', lastActivityAt: new Date().toISOString() } as TurnState);
          for (const agent of agents) {
            const historical = agentRunIds.get(agent.id) ?? [];
            const merged: ProviderRunId[] = [...historical];
            if (agent.runId && !merged.includes(agent.runId)) {
              merged.push(agent.runId);
            }
            if (merged.length > 0) {
              seededHistory[agent.id] = merged;
            }
            if (agent.status === 'running' && agent.runId) {
              seededTurnState[agent.id] = {
                kind: 'running',
                runId: agent.runId,
                startedAt: agent.startedAt ?? (new Date().toISOString() as IsoDateTime),
              };
            } else if (agent.status === 'failed') {
              seededTurnState[agent.id] = {
                kind: 'error',
                message: 'agent failed',
                failedAt: agent.completedAt ?? (new Date().toISOString() as IsoDateTime),
              };
            } else {
              seededTurnState[agent.id] =
                sessionState.kind === 'ended'
                  ? sessionState
                  : { kind: 'idle', lastActivityAt: new Date().toISOString() as IsoDateTime };
            }
          }

          const kindOverridesFromDb: Record<string, AgentKind> = {};
          for (const agent of agents) {
            if (agent.kind) {
              kindOverridesFromDb[agent.id] = agent.kind as AgentKind;
            }
          }
          set((state) => ({
            sessionPhaseRuns: { ...state.sessionPhaseRuns, [id]: agents },
            agentRunHistory: { ...state.agentRunHistory, ...seededHistory },
            agentTurnState: { ...state.agentTurnState, ...seededTurnState },
            agentKindOverride: { ...state.agentKindOverride, ...kindOverridesFromDb },
          }));
          markDone('agents');
          void get()
            .loadResolveSession({ sessionId: id })
            .catch((error: unknown) => {
              void get().emitNotification(
                'error',
                'error',
                'could not load resolver outcomes',
                formatError(error),
                { sessionId: id },
              );
            });
          void get().loadPendingResolutions(id);

          if (!get().selectedAgentId[id]) {
            set((state) => ({
              messages: { ...state.messages, [id]: [] as ReadonlyArray<Message> },
            }));
            markDone('transcript');
          }
        })
        .catch((error: unknown) => {
          console.error(`[agents] load failed for session ${id}`, formatError(error));
          markDone('agents');
          markDone('transcript');
        })
        .finally(() => endAgents());
    }
  };
};
