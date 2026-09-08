import {
  listResolveAttempts,
  listResolveThreads,
  setResolveAttemptPhase,
  upsertResolveThread,
} from '@goodboy/db';
import type { ResolveThread } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelWorktreeWriter } from '../../../features/worktree/worktree';
import { outcomePatch } from './outcomePatch';
import { projectResolveRows } from './projectResolveRows';
import { resolveWorktreePath } from './resolveWorktreePath';
import { threadOutcome } from './threadOutcome';
import type { CancelAttemptParams, SliceParams } from './types';

type Params = SliceParams & CancelAttemptParams;

const restored = ({ row }: { readonly row: ResolveThread }): Partial<ResolveThread> => {
  const retained = threadOutcome({ row });
  if (retained === null) {
    return { state: 'open', stateReason: null, question: null };
  }
  return outcomePatch({ outcome: retained });
};

export const cancelResolveAttempt = async ({
  set,
  get,
  sessionId,
  attemptId,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  const attempt = (await listResolveAttempts({ db, sessionId })).find(
    (item) => item.id === attemptId,
  );
  if (attempt === undefined || attempt.phase !== 'queued') {
    return;
  }
  await setResolveAttemptPhase({ db, id: attemptId, phase: 'cancelled', error: 'cancelled' });
  const worktreePath = await resolveWorktreePath({ get, sessionId });
  if (worktreePath !== null) {
    await cancelWorktreeWriter({ path: worktreePath, holder: attempt.agentId });
  }
  const rows = await listResolveThreads({ db, sessionId });
  for (const row of rows) {
    if (row.activeAttemptId !== attemptId || row.state === 'closed') {
      continue;
    }
    await upsertResolveThread({
      db,
      row: { ...row, ...restored({ row }), activeAttemptId: null, updatedAt: Date.now() },
      expectedRevision: row.revision,
    });
  }
  projectResolveRows({
    set,
    get,
    sessionId,
    rows: await listResolveThreads({ db, sessionId }),
    attempts: await listResolveAttempts({ db, sessionId }),
  });
};
