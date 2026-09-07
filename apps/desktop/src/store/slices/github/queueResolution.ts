import { outcomePatch } from '../resolve/outcomePatch';
import { listPendingResolutionsForSession, queuePendingResolution } from '@goodboy/db';
import type { PendingResolutionOutcome, ResolveThread, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { resolverOutcomeForThread } from './resolverOutcomeForThread';
import type { GetFn, SetFn } from './types';

type QueueArgs = {
  readonly threadId: string;
  readonly commitSha: string;
  readonly prNumber: number;
  readonly reply?: string | null;
  readonly outcome?: PendingResolutionOutcome | null;
};

export const queueResolution = (set: SetFn, get: GetFn) => {
  return async (
    sessionId: SessionId,
    { threadId, commitSha, prNumber, reply, outcome: explicitOutcome }: QueueArgs,
  ): Promise<void> => {
    const outcome = resolverOutcomeForThread({
      outcomes: get().resolverThreadOutcomes,
      threadId,
    });
    await queuePendingResolution({
      db: tauriDatabase,
      id: crypto.randomUUID(),
      sessionId,
      prNumber,
      threadId,
      commitSha,
      reply: reply === undefined ? (outcome?.reply ?? null) : reply,
      outcome: explicitOutcome ?? outcome?.kind ?? null,
    });
    const initialOutcome: Partial<ResolveThread> =
      outcome !== null && outcome !== undefined
        ? outcomePatch({ outcome })
        : explicitOutcome === 'resolved'
          ? { state: 'fixed', disposition: 'fix' }
          : explicitOutcome === 'wontfix'
            ? { state: 'answered', disposition: 'no_change', stateReason: 'legacy_wontfix' }
            : {
                state: 'needs_answer',
                disposition: explicitOutcome === 'analyzed' ? 'reply' : null,
                stateReason: 'review_legacy_result',
              };
    await get().updateResolveThread({
      sessionId,
      threadId,
      prNumber,
      initialPatch: initialOutcome,
      patch: {
        ...(commitSha !== '' && { commitShas: [commitSha] }),
        ...(reply !== undefined && { replyDraft: reply }),
      },
    });
    const rows = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
    set((state) => ({
      sessionPendingResolutions: { ...state.sessionPendingResolutions, [sessionId]: rows },
    }));
  };
};
