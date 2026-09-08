import { listResolveQueueItems, upsertResolveThread } from '@goodboy/db';
import { worktreeIsAncestor, worktreeStatus } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import { resolveWorktreePath } from './resolveWorktreePath';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;

export const BASE_CHANGED_REASON = 'base_changed';

export const invalidateIntegratedApprovals = async ({
  set,
  get,
  sessionId,
}: Params): Promise<number> => {
  const db = tauriDatabase;
  const worktreePath = await resolveWorktreePath({ get, sessionId });
  if (worktreePath === null) {
    return 0;
  }
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  const head = status?.head ?? '';
  if (head === '') {
    return 0;
  }
  const entries = await listResolveQueueItems({ db, sessionId });
  let invalidated = 0;
  for (const { item, thread } of entries) {
    if (item.approvalState !== 'accepted' || item.integratedSha === null) {
      continue;
    }
    const isReachable = await worktreeIsAncestor({
      worktreePath,
      sha: item.integratedSha,
      head,
    }).catch(() => true);
    if (isReachable) {
      continue;
    }
    const written = await upsertResolveThread({
      db,
      row: { ...thread, stateReason: BASE_CHANGED_REASON, updatedAt: Date.now() },
      expectedRevision: thread.revision,
    });
    if (written) {
      invalidated += 1;
    }
  }
  if (invalidated > 0) {
    await loadResolveQueueItemsInto({ set, sessionId });
  }
  return invalidated;
};
