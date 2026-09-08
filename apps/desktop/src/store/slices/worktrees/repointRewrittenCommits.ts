import { listResolvePublicationsForSession, setResolvePublicationPhase } from '@goodboy/db';
import type { SessionId } from '@goodboy/types';
import type { RewrittenHead } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly head: RewrittenHead;
};

export const repointRewrittenCommits = async ({
  set,
  get,
  sessionId,
  head,
}: Params): Promise<void> => {
  const replaced = new Set(head.replaced);
  if (replaced.size === 0) {
    return;
  }
  const publications = await listResolvePublicationsForSession({
    db: tauriDatabase,
    sessionId,
  }).catch(() => []);
  for (const publication of publications) {
    if (publication.phase !== 'previewed') {
      continue;
    }
    if (!publication.commitShas.some((sha) => replaced.has(sha))) {
      continue;
    }
    await setResolvePublicationPhase({
      db: tauriDatabase,
      id: publication.id,
      phase: 'cancelled',
      error: 'stale',
    });
    set((state) => ({
      activePublicationPreview: { ...state.activePublicationPreview, [sessionId]: null },
    }));
  }
  for (const row of get().sessionResolveThreads[sessionId] ?? []) {
    if (row.commitShas?.some((sha) => replaced.has(sha)) !== true) {
      continue;
    }
    await get().updateResolveThread({
      sessionId,
      threadId: row.threadId,
      patch: { commitShas: row.commitShas.map((sha) => (replaced.has(sha) ? head.sha : sha)) },
    });
  }
};
