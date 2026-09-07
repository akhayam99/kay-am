import {
  listResolveAttempts,
  listResolveThreads,
  setResolveAttemptPhase,
  upsertResolveThread,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { createResolveThread } from './createResolveThread';
import { projectResolveRows } from './projectResolveRows';
import type { PhaseParams, SliceParams } from './types';

type Params = SliceParams & PhaseParams;

export const recordResolvePhase = async ({
  set,
  get,
  sessionId,
  agentId,
  attemptId,
  phase,
  error = null,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  const attempts = await listResolveAttempts({ db, sessionId });
  const attempt = [...attempts].reverse().find((item) => item.agentId === agentId);
  if (attemptId !== undefined && attempt?.id !== attemptId) {
    return;
  }
  if (attempt !== undefined) {
    await setResolveAttemptPhase({ db, id: attempt.id, phase, error });
  }
  if (phase === 'failed' || phase === 'cancelled') {
    const rows = await listResolveThreads({ db, sessionId });
    const agent = get().sessionPhaseRuns[sessionId]?.find((item) => item.id === agentId);
    const owned = attempt?.threadIds ?? (agent === undefined ? [] : agentThreadIds(agent));
    for (const threadId of owned) {
      const previous = rows.find((row) => row.threadId === threadId);
      const row =
        previous ??
        createResolveThread({
          sessionId,
          threadId,
          agent,
          prNumber: get().sessionGithub[sessionId]?.pr?.number,
        });
      if ((attempt !== undefined && row.activeAttemptId !== attempt.id) || row.state === 'closed') {
        continue;
      }
      await upsertResolveThread({
        db,
        row: {
          ...row,
          state: 'failed',
          stateReason: `${phase === 'cancelled' ? 'stopped' : 'failed'}${row.disposition !== null && row.stateReason !== null ? `:${row.stateReason}` : ''}`,
          updatedAt: Date.now(),
        },
        expectedRevision: previous?.revision ?? null,
      });
    }
  }
  projectResolveRows({
    set,
    get,
    sessionId,
    rows: await listResolveThreads({ db, sessionId }),
    attempts: await listResolveAttempts({ db, sessionId }),
  });
};
