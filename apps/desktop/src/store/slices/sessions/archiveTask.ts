import type { IsoDateTime, Session, SessionId } from '@goodboy/types';
import { archiveSession as archiveSessionInDb } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { dropPendingTurnEvents } from '../transcripts/buffer';
import type { ArchiveTaskOptions, GetFn, SetFn } from './types';

export const archiveTask = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, options: ArchiveTaskOptions = {}): Promise<void> => {
    const prev = get().sessions.find((s) => s.id === sessionId);
    if (!prev) {
      return;
    }
    const nowIso = new Date().toISOString() as IsoDateTime;
    const archived: Session = { ...prev, archivedAt: nowIso };
    const workspaceId = prev.workspaceId;
    const isCurrent = get().currentSessionId === sessionId;

    set((state) => {
      const cached = state.archivedSessions[workspaceId] ?? [];
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        archivedSessions: { ...state.archivedSessions, [workspaceId]: [archived, ...cached] },
      };
    });

    try {
      await archiveSessionInDb(tauriDatabase, sessionId);
    } catch (err) {
      set((state) => {
        const cached = state.archivedSessions[workspaceId] ?? [];
        return {
          sessions: [...state.sessions, prev],
          archivedSessions: {
            ...state.archivedSessions,
            [workspaceId]: cached.filter((s) => s.id !== sessionId),
          },
        };
      });
      throw err;
    }

    await get()
      .cleanupSessionMounts({
        sessionId,
        reason: 'archive',
        keepDirectories: options.cleanWorktrees !== true,
      })
      .catch(() => undefined);

    if (isCurrent) {
      return;
    }

    dropPendingTurnEvents({
      agentIds: (get().sessionPhaseRuns[sessionId] ?? []).map((agent) => agent.id),
    });
    get().evictSession({ sessionId, mode: 'archive' });
  };
};
