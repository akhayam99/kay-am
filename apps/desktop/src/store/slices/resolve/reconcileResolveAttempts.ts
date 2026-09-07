import { listMessagesForAgent, setResolveAttemptPhase, upsertResolveThread } from '@goodboy/db';
import type { ResolveAttempt, ResolveThread } from '@goodboy/types';
import { listLiveRunIds } from '../../../features/chat/turn';
import { tauriDatabase } from '../../../shared/lib/db';
import { resolverTurnOutcomes } from '../../../features/session/resolverTurnOutcomes';
import { outcomePatch } from './outcomePatch';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams &
  SessionParams & {
    readonly rows: ReadonlyArray<ResolveThread>;
    readonly attempts: ReadonlyArray<ResolveAttempt>;
  };

export const reconcileResolveAttempts = async ({
  get,
  sessionId,
  rows,
  attempts,
}: Params): Promise<void> => {
  if (!rows.some((row) => row.state === 'working')) {
    return;
  }
  const liveRunIds = await listLiveRunIds();
  for (const attempt of attempts) {
    const working = rows.filter(
      (row) => row.state === 'working' && row.activeAttemptId === attempt.id,
    );
    const turnState = get().agentTurnState?.[attempt.agentId];
    const agent = get().sessionPhaseRuns[sessionId]?.find((item) => item.id === attempt.agentId);
    const runId = turnState?.kind === 'running' ? turnState.runId : agent?.runId;
    const isRunning = runId !== undefined && liveRunIds.has(runId);
    if (
      working.length === 0 ||
      (attempt.phase === 'running' && isRunning) ||
      attempt.phase === 'queued'
    ) {
      continue;
    }
    const nextAttempt = attempts.find(
      (item) => item.agentId === attempt.agentId && item.createdAt > attempt.createdAt,
    );
    const messages = await listMessagesForAgent(tauriDatabase, attempt.agentId);
    const assistantText = messages
      .filter((message) => {
        const timestamp = Date.parse(message.createdAt);
        return (
          message.role === 'assistant' &&
          timestamp >= (attempt.startedAt ?? attempt.createdAt) &&
          (attempt.endedAt === null || timestamp <= attempt.endedAt) &&
          (nextAttempt === undefined || timestamp < nextAttempt.createdAt)
        );
      })
      .map((message) => message.content)
      .join('\n');
    const parsed = resolverTurnOutcomes({ assistantText, previousOutcomes: {} });
    let hasFailure = false;
    let hasQuestion = false;
    for (const row of working) {
      const outcome = parsed.turnOutcomes[row.threadId];
      const patch =
        outcome === undefined
          ? ({
              state: 'failed',
              stateReason: 'interrupted',
              disposition: null,
              commitShas: null,
              replyDraft: null,
              question: null,
            } satisfies Partial<ResolveThread>)
          : outcomePatch({ outcome, verdict: parsed.analysisVerdicts[row.threadId] });
      hasFailure = hasFailure || patch.state === 'failed';
      hasQuestion = hasQuestion || patch.state === 'needs_answer';
      await upsertResolveThread({
        db: tauriDatabase,
        row: { ...row, ...patch, updatedAt: Date.now() },
        expectedRevision: row.revision,
      });
    }
    await setResolveAttemptPhase({
      db: tauriDatabase,
      id: attempt.id,
      phase: hasFailure ? 'failed' : hasQuestion ? 'waiting' : 'finished',
      error: hasFailure ? 'interrupted' : null,
    });
  }
};
