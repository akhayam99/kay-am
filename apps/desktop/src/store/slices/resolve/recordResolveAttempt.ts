import {
  insertResolveAttempt,
  listResolveAttempts,
  listResolveThreads,
  upsertResolveThread,
} from '@goodboy/db';
import type { ResolveAttempt } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { createResolveThread } from './createResolveThread';
import { threadOutcome } from './threadOutcome';
import { projectResolveRows } from './projectResolveRows';
import type { AttemptParams, SliceParams } from './types';

type Params = SliceParams & AttemptParams;

export const recordResolveAttempt = async ({
  set,
  get,
  sessionId,
  agent,
  provider,
  model,
  effort,
  instructions,
  phase,
  threadIds,
}: Params): Promise<string> => {
  const db = tauriDatabase;
  const attempts = await listResolveAttempts({ db, sessionId });
  const queued = attempts.find(
    (attempt) =>
      attempt.agentId === agent.id && (attempt.phase === 'queued' || attempt.phase === 'running'),
  );
  const now = Date.now();
  const attempt: ResolveAttempt = {
    id: queued?.id ?? crypto.randomUUID(),
    sessionId,
    agentId: agent.id,
    prNumber: createResolveThread({
      sessionId,
      threadId: '',
      agent,
      prNumber: get().sessionGithub[sessionId]?.pr?.number,
    }).prNumber,
    threadIds: agentThreadIds(agent),
    provider,
    model,
    effort,
    instructions,
    phase,
    startedAt: phase === 'running' ? now : null,
    endedAt: null,
    error: null,
    createdAt: queued?.createdAt ?? now,
  };
  await insertResolveAttempt({ db, attempt });
  const rows = await listResolveThreads({ db, sessionId });
  const claimed = threadIds ?? attempt.threadIds;
  for (const threadId of claimed) {
    const previous = rows.find((row) => row.threadId === threadId);
    if (previous?.state === 'closed') {
      continue;
    }
    const row =
      previous ??
      createResolveThread({
        sessionId,
        threadId,
        agent,
        projectId: get().sessionActiveProject[sessionId] ?? null,
        prNumber: attempt.prNumber,
      });
    await upsertResolveThread({
      db,
      row: {
        ...row,
        state: 'working',
        stateReason:
          threadOutcome({ row }) === null
            ? null
            : (row.stateReason?.replace(
                /^(?:(?:missing_result|stopped|failed|dirty_tree):)+/,
                '',
              ) ?? null),
        question: null,
        activeAttemptId: attempt.id,
        updatedAt: now,
      },
      expectedRevision: previous?.revision ?? null,
    });
  }
  projectResolveRows({
    set,
    get,
    sessionId,
    rows: await listResolveThreads({ db, sessionId }),
    attempts: await listResolveAttempts({ db, sessionId }),
  });
  return attempt.id;
};
