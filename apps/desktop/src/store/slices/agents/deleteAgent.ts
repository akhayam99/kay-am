import type { AgentId, IsoDateTime, SessionId } from '@goodboy/types';
import { updateSessionState } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelTurn, deleteAttachment } from '../../../features/chat/turn';
import { abandonWorktreeWriter } from '../../../features/worktree/worktree';
import { invokeAgentList } from '../../../features/workflows/workflows';
import { resolveWorktreePath } from '../resolve/resolveWorktreePath';
import { cancelledRunIds, deriveSessionState } from '../../session-mutators';
import { dropPendingTurnEvents } from '../transcripts/buffer';
import type { GetFn, SetFn } from './types';

export const deleteAgent = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, agentId: AgentId) => {
    const agentTurn = get().agentTurnState[agentId];
    const agentRunId = agentTurn?.kind === 'running' ? agentTurn.runId : null;
    if (agentRunId !== null) {
      cancelledRunIds.add(agentRunId);
      await cancelTurn(agentRunId).catch(() => undefined);
    }

    const writerPath = await resolveWorktreePath({ get, sessionId });
    if (writerPath !== null) {
      await abandonWorktreeWriter({ path: writerPath, holder: agentId });
    }

    const worktree = (get().sessionWorktrees[sessionId] ?? [])[0] ?? null;
    if (worktree !== null) {
      for (const att of get().agentAttachments[agentId] ?? []) {
        await deleteAttachment(worktree, att.relPath).catch(() => undefined);
      }
    }

    await tauriDatabase.execute('DELETE FROM agents WHERE id = ?', [agentId]);
    const refreshed = await invokeAgentList(sessionId);
    let derived: ReturnType<typeof deriveSessionState> | null = null;
    dropPendingTurnEvents({ agentIds: [agentId] });
    set((s) => {
      const wasSelected = s.selectedAgentId[sessionId] === agentId;
      const nextSelected = { ...s.selectedAgentId };
      if (wasSelected) {
        delete nextSelected[sessionId];
      }
      const nextTurnState = { ...s.agentTurnState };
      delete nextTurnState[agentId];
      const nextTranscripts = { ...s.transcripts };
      delete nextTranscripts[agentId];
      const nextDraft = { ...s.agentDraft };
      delete nextDraft[agentId];
      const nextAttachments = { ...s.agentAttachments };
      delete nextAttachments[agentId];
      const nextQueue = { ...s.agentQueue };
      delete nextQueue[agentId];
      const nextHistory = { ...s.agentRunHistory };
      delete nextHistory[agentId];
      const nextModelOverride = { ...s.agentModelOverride };
      delete nextModelOverride[agentId];
      const nextProviderOverride = { ...s.agentProviderOverride };
      delete nextProviderOverride[agentId];
      const nextEffortOverride = { ...s.agentEffortOverride };
      delete nextEffortOverride[agentId];
      const nextKindOverride = { ...s.agentKindOverride };
      delete nextKindOverride[agentId];
      const survivorStates = refreshed
        .map((a) => nextTurnState[a.id])
        .filter((st): st is NonNullable<typeof st> => st !== undefined);
      derived = deriveSessionState(survivorStates, new Date().toISOString() as IsoDateTime);
      return {
        sessionPhaseRuns: { ...s.sessionPhaseRuns, [sessionId]: refreshed },
        selectedAgentId: nextSelected,
        agentTurnState: nextTurnState,
        transcripts: nextTranscripts,
        agentDraft: nextDraft,
        agentAttachments: nextAttachments,
        agentQueue: nextQueue,
        agentRunHistory: nextHistory,
        agentModelOverride: nextModelOverride,
        agentProviderOverride: nextProviderOverride,
        agentEffortOverride: nextEffortOverride,
        agentKindOverride: nextKindOverride,
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, state: derived! } : sess,
        ),
      };
    });
    if (derived !== null) {
      await updateSessionState(
        tauriDatabase,
        sessionId,
        derived,
        new Date().toISOString() as IsoDateTime,
      ).catch(() => undefined);
    }
  };
};
