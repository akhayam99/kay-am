import {
  listOpenQuestionsForSession,
  insertResolveAttempt,
  listResolveAttempts,
  listResolveQueueItems,
  listResolveThreads,
  insertResolveQueueItem,
  setResolveAttemptPhase,
  upsertResolveThread,
} from '@goodboy/db';
import type { ResolveThread } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { resolverTurnOutcomes } from '../../../features/session/resolverTurnOutcomes';
import { captureResolveCandidate } from './captureResolveCandidate';
import { createResolveThread } from './createResolveThread';
import { outcomePatch } from './outcomePatch';
import { projectResolveRows } from './projectResolveRows';
import { threadOutcome } from './threadOutcome';
import type { SliceParams, TurnParams } from './types';

type Params = SliceParams & TurnParams;

export const persistResolveTurn = async ({
  set,
  get,
  sessionId,
  agent,
  assistantText,
  isCandidate = false,
  attemptId,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  const rows = await listResolveThreads({ db, sessionId });
  const previousOutcomes = Object.fromEntries(
    rows.flatMap((row) => {
      const outcome = threadOutcome({ row, shouldIncludeCandidate: true });
      return outcome === null ? [] : [[row.threadId, outcome]];
    }),
  );
  const parsed = resolverTurnOutcomes({ assistantText, previousOutcomes });
  const sourceThreadIds = agentThreadIds(agent);
  const owned = sourceThreadIds.length > 0 ? sourceThreadIds : Object.keys(parsed.turnOutcomes);
  if (owned.length === 0) {
    return;
  }
  const hasOwnedMarkers = owned.some((threadId) => parsed.turnOutcomes[threadId] !== undefined);
  if (isCandidate && !hasOwnedMarkers) {
    return;
  }
  const attempts = await listResolveAttempts({ db, sessionId });
  const attempt = [...attempts].reverse().find((item) => item.agentId === agent.id);
  if (
    attemptId !== undefined &&
    (attempt?.id !== attemptId ||
      attempt.phase === 'cancelled' ||
      attempt.phase === 'failed' ||
      (isCandidate && attempt.phase !== 'running'))
  ) {
    return;
  }
  if (sourceThreadIds.length === 0 && attempt !== undefined) {
    await insertResolveAttempt({ db, attempt: { ...attempt, threadIds: owned } });
  }
  const questions = isCandidate ? [] : await listOpenQuestionsForSession(db, sessionId);
  const question =
    questions.find((item) => item.createdByAgentId === agent.id && item.status === 'open')?.text ??
    null;
  for (const threadId of owned) {
    const previous = rows.find((row) => row.threadId === threadId);
    if (
      previous?.state === 'closed' ||
      (attemptId !== undefined && previous !== undefined && previous.activeAttemptId !== attemptId)
    ) {
      continue;
    }
    const outcome = parsed.turnOutcomes[threadId];
    if (isCandidate && outcome === undefined) {
      continue;
    }
    const row =
      previous ??
      createResolveThread({
        sessionId,
        threadId,
        agent,
        projectId: get().sessionActiveProject[sessionId] ?? null,
        prNumber: get().sessionGithub[sessionId]?.pr?.number,
      });
    const retained = threadOutcome({ row });
    const verdict =
      parsed.analysisVerdicts[threadId] ??
      (row.disposition === 'no_change' ? 'wontfix' : undefined);
    const patch: Partial<ResolveThread> =
      outcome === undefined
        ? retained !== null && (hasOwnedMarkers || question !== null)
          ? outcomePatch({ outcome: retained, verdict })
          : {
              state: question === null ? 'failed' : 'needs_answer',
              stateReason:
                question === null
                  ? `missing_result${retained !== null && row.stateReason !== null ? `:${row.stateReason}` : ''}`
                  : 'question',
              question,
            }
        : outcomePatch({ outcome, verdict });
    const next = {
      ...row,
      ...patch,
      activeAttemptId: attempt?.id ?? row.activeAttemptId,
      updatedAt: Date.now(),
    };
    if (isCandidate) {
      next.state = 'working';
      next.stateReason = `candidate:${patch.stateReason ?? patch.state ?? ''}`;
    }
    await upsertResolveThread({ db, row: next, expectedRevision: previous?.revision ?? null });
  }
  if (!isCandidate && attempt !== undefined) {
    const waiting = (await listResolveThreads({ db, sessionId })).some(
      (row) => owned.includes(row.threadId) && row.state === 'needs_answer',
    );
    await setResolveAttemptPhase({ db, id: attempt.id, phase: waiting ? 'waiting' : 'finished' });
  }
  if (!isCandidate) {
    const updatedRows = await listResolveThreads({ db, sessionId });
    const queueItems = await listResolveQueueItems({ db, sessionId });
    const queuedThreadIds = new Set(queueItems.map(({ thread }) => thread.threadId));
    for (const row of updatedRows) {
      if (
        !owned.includes(row.threadId) ||
        row.disposition === null ||
        queuedThreadIds.has(row.threadId)
      ) {
        continue;
      }
      const now = Date.now();
      await insertResolveQueueItem({
        db,
        item: {
          id: crypto.randomUUID(),
          sessionId,
          threadId: row.threadId,
          generation: 0,
          reopenedFromItemId: null,
          candidateRevision: row.revision,
          approvalState: 'none',
          approvedRevision: null,
          approvedReplyHash: null,
          integratedSha: null,
          deferredAt: null,
          deliveredAt: null,
          supersededAt: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    if (attempt !== undefined) {
      await captureResolveCandidate({
        set,
        get,
        sessionId,
        attemptId: attempt.id,
        threadIds: owned,
      }).catch(() => null);
    }
    projectResolveRows({
      set,
      get,
      sessionId,
      rows: updatedRows,
      attempts: await listResolveAttempts({ db, sessionId }),
    });
    const refreshedQueueItems = await listResolveQueueItems({ db, sessionId });
    set((state) => ({
      sessionResolveQueueItems: {
        ...state.sessionResolveQueueItems,
        [sessionId]: refreshedQueueItems,
      },
    }));
  }
};
