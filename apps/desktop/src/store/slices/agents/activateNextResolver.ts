import type { AgentId, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { classifyAgent } from '../../../features/session/agent-kind';
import type { GetFn, SetFn } from './types';

const resolverStartsPending = new Map<SessionId, AgentId>();

export const activateNextResolver = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId): Promise<void> => {
    const runs = get().sessionPhaseRuns[sessionId] ?? [];
    const guardedAgentId = resolverStartsPending.get(sessionId);
    if (guardedAgentId !== undefined) {
      const guardedAgent = runs.find((agent) => agent.id === guardedAgentId);
      if (guardedAgent !== undefined && guardedAgent.status === 'pending') {
        return;
      }
      resolverStartsPending.delete(sessionId);
    }
    const pending = get().pendingResolverKickoff;
    const resolvers = runs.filter(
      (agent) => classifyAgent(agent, get().agentKindOverride[agent.id] ?? null) === 'resolver',
    );
    const anyRunning = resolvers.some((a) => a.status === 'running');
    if (anyRunning) {
      return;
    }
    const next = resolvers
      .filter((a) => a.status === 'pending' && a.doneAt == null && pending[a.id] !== undefined)
      .sort((a, b) => a.ordinal - b.ordinal)[0];
    if (!next) {
      return;
    }
    const kickoff = pending[next.id];
    if (kickoff === undefined) {
      return;
    }
    resolverStartsPending.set(sessionId, next.id);
    try {
      await get().recordResolvePhase({ sessionId, agentId: next.id, phase: 'running' });
    } catch (error) {
      resolverStartsPending.delete(sessionId);
      throw error;
    }
    set((s) => {
      const nextPending = { ...s.pendingResolverKickoff };
      delete nextPending[next.id];
      return { pendingResolverKickoff: nextPending };
    });
    void get()
      .sendTurn({ sessionId, agentId: next.id, content: kickoff })
      .catch(async (error: unknown) => {
        await get().recordResolvePhase({
          sessionId,
          agentId: next.id,
          phase: 'failed',
          error: formatError(error),
        });
        void get().emitNotification(
          'error',
          'error',
          'resolver failed to start',
          formatError(error),
          { sessionId },
        );
      })
      .finally(() => {
        if (resolverStartsPending.get(sessionId) === next.id) {
          resolverStartsPending.delete(sessionId);
        }
      });
  };
};
