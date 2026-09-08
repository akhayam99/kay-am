import type { AgentId, IsoDateTime, SessionId, TurnState } from '@goodboy/types';
import { updateSessionState } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelTurn } from '../../../features/chat/turn';
import { abandonWorktreeWriter } from '../../../features/worktree/worktree';
import { resolveWorktreePath } from '../resolve/resolveWorktreePath';
import { invokeAgentList, invokeAgentUpdateStatus } from '../../../features/workflows/workflows';
import { applyAgentTurnState, cancelledRunIds } from '../../session-mutators';
import type { GetFn, SetFn } from './types';

export const forceCloseResolver = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, agentId: AgentId): Promise<void> => {
    const turnState = get().agentTurnState[agentId];
    if (turnState?.kind === 'running') {
      cancelledRunIds.add(turnState.runId);
      await cancelTurn(turnState.runId).catch(() => undefined);
    }
    await get().recordResolvePhase({ sessionId, agentId, phase: 'cancelled' });
    const now = new Date().toISOString() as IsoDateTime;
    await invokeAgentUpdateStatus(agentId, { status: 'skipped', completedAt: now }).catch(
      () => undefined,
    );
    const refreshed = await invokeAgentList(sessionId).catch(() => null);
    if (refreshed !== null) {
      set((state) => ({
        sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshed },
      }));
    }
    const idleState: TurnState = { kind: 'idle', lastActivityAt: now };
    const derived = applyAgentTurnState(set, sessionId, agentId, idleState, now);
    await updateSessionState(tauriDatabase, sessionId, derived, now).catch(() => undefined);
    const worktreePath = await resolveWorktreePath({ get, sessionId });
    if (worktreePath !== null) {
      await abandonWorktreeWriter({ path: worktreePath, holder: agentId });
    }
    await get().drainResolveQueue({ sessionId });
  };
};
