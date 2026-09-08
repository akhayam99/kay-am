import { upsertResolvePublicationThread } from '@goodboy/db';
import type { ResolvePublicationThread, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly frozen: ResolvePublicationThread;
};

export const markThreadDone = async ({
  get,
  sessionId,
  threadId,
  frozen,
}: Params): Promise<void> => {
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, resolvePhase: 'resolving' },
  });
  const closedAt = Date.now();
  await get().updateResolveThread({
    sessionId,
    threadId,
    patch: {
      state: 'closed',
      githubResolved: false,
      closedAt,
      closedSource: 'goodboy',
      stateReason: null,
    },
  });
  await upsertResolvePublicationThread({
    db: tauriDatabase,
    thread: { ...frozen, resolvePhase: 'resolved', resolvedAt: closedAt },
  });
};
