import { resolveReviewThread } from '@goodboy/core';
import { upsertResolvePublicationThread } from '@goodboy/db';
import type { ResolvePublicationThread, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { tauriGhRunner } from '../../../features/github/github';
import { sessionThreadGhOptions } from './sessionThreadGhOptions';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly frozen: ResolvePublicationThread;
};

export const markThreadResolvedNoPush = async ({
  set,
  get,
  sessionId,
  threadId,
  frozen,
}: Params): Promise<void> => {
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, resolvePhase: 'resolving' },
  });
  await resolveReviewThread(tauriGhRunner, threadId, sessionThreadGhOptions({ get, sessionId }));
  const resolvedAt = Date.now();
  await get().updateResolveThread({
    sessionId,
    threadId,
    patch: {
      state: 'closed',
      githubResolved: true,
      closedAt: resolvedAt,
      closedSource: 'goodboy',
      stateReason: null,
    },
  });
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, resolvePhase: 'resolved', resolvedAt },
  });
  set((state) => {
    const known = state.sessionResolvedThreads[sessionId] ?? [];
    if (known.includes(threadId)) {
      return {};
    }
    return {
      sessionResolvedThreads: {
        ...state.sessionResolvedThreads,
        [sessionId]: [...known, threadId],
      },
    };
  });
};
