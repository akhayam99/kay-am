import {
  listResolveAttempts,
  listResolveQueueItems,
  listResolveThreads,
  upsertResolveThread,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { drainResolveQueue } from './drainResolveQueue';
import { reconcileResolveAttempts } from './reconcileResolveAttempts';
import { importLegacyResolve } from './importLegacyResolve';
import { projectResolveRows } from './projectResolveRows';
import { loadPublicationsInto } from './publicationState';
import { recoverUncapturedResolveWork } from './recoverUncapturedResolveWork';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;

export const loadResolveSession = async ({ set, get, sessionId }: Params): Promise<void> => {
  await recoverUncapturedResolveWork({ set, get, sessionId }).catch(() => null);
  await importLegacyResolve({ set, get, sessionId });
  await reconcileResolveAttempts({
    set,
    get,
    sessionId,
    rows: await listResolveThreads({ db: tauriDatabase, sessionId }),
    attempts: await listResolveAttempts({ db: tauriDatabase, sessionId }),
  });
  const rows = await listResolveThreads({ db: tauriDatabase, sessionId });
  const github = get().sessionGithub[sessionId];
  for (const row of rows) {
    const thread = github?.detail?.comments.find((item) => item.threadId === row.threadId);
    if (
      github?.pr?.number !== row.prNumber ||
      thread?.resolved !== true ||
      row.githubResolved === true
    ) {
      continue;
    }
    await upsertResolveThread({
      db: tauriDatabase,
      row: {
        ...row,
        state: 'closed',
        githubResolved: true,
        closedAt: Date.now(),
        closedSource: 'github',
        updatedAt: Date.now(),
      },
      expectedRevision: row.revision,
    });
  }
  const attempts = await listResolveAttempts({ db: tauriDatabase, sessionId });
  const queueItems = await listResolveQueueItems({ db: tauriDatabase, sessionId });
  projectResolveRows({
    set,
    get,
    sessionId,
    rows: await listResolveThreads({ db: tauriDatabase, sessionId }),
    attempts,
  });
  set((state) => ({
    sessionResolveQueueItems: {
      ...state.sessionResolveQueueItems,
      [sessionId]: queueItems,
    },
  }));
  await loadPublicationsInto({ set, sessionId });
  await drainResolveQueue({ set, get, sessionId });
};
