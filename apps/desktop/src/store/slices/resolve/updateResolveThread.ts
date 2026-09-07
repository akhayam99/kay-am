import { listResolveThreads, upsertResolveThread } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { createResolveThread } from './createResolveThread';
import { projectResolveRows } from './projectResolveRows';
import type { SliceParams, UpdateParams } from './types';

type Params = SliceParams & UpdateParams;

export const updateResolveThread = async ({
  set,
  get,
  sessionId,
  threadId,
  patch,
  initialPatch,
  revision,
  prNumber,
}: Params): Promise<boolean> => {
  const db = tauriDatabase;
  const rows = await listResolveThreads({ db, sessionId });
  const previous = rows.find((row) => row.threadId === threadId);
  const row = {
    ...(previous ?? createResolveThread({ sessionId, threadId, prNumber })),
    ...(previous === undefined ? initialPatch : {}),
    ...patch,
    updatedAt: Date.now(),
  };
  if (revision !== undefined && previous?.revision !== revision) {
    return false;
  }
  const saved = await upsertResolveThread({
    db,
    row,
    expectedRevision: previous?.revision ?? null,
  });
  if (!saved) {
    return false;
  }
  projectResolveRows({
    set,
    get,
    sessionId,
    rows: [
      ...rows.filter((item) => item.threadId !== threadId),
      { ...row, revision: previous === undefined ? 0 : previous.revision + 1 },
    ],
    attempts: get().sessionResolveAttempts[sessionId] ?? [],
  });
  return true;
};
