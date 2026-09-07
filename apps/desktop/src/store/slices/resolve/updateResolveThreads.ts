import { listResolveThreads, upsertResolveThread } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { projectResolveRows } from './projectResolveRows';
import type { BatchUpdateParams, SliceParams } from './types';

type Params = SliceParams & BatchUpdateParams;

export const updateResolveThreads = async ({
  set,
  get,
  sessionId,
  updates,
}: Params): Promise<void> => {
  const rows = [...(await listResolveThreads({ db: tauriDatabase, sessionId }))];
  const changes = typeof updates === 'function' ? updates({ rows }) : updates;
  for (const update of changes) {
    const index = rows.findIndex((row) => row.threadId === update.threadId);
    const previous = rows[index];
    if (
      previous === undefined ||
      (update.revision !== undefined && previous.revision !== update.revision)
    ) {
      continue;
    }
    const row = { ...previous, ...update.patch, updatedAt: Date.now() };
    if (
      await upsertResolveThread({ db: tauriDatabase, row, expectedRevision: previous.revision })
    ) {
      rows[index] = { ...row, revision: previous.revision + 1 };
    }
  }
  projectResolveRows({
    set,
    get,
    sessionId,
    rows,
    attempts: get().sessionResolveAttempts[sessionId] ?? [],
  });
};
