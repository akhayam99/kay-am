import {
  finalizeResolveCandidateIntegration,
  getReadyResolveCandidateForItem,
  listResolveCandidateItems,
  listResolveQueueItems,
  setResolveQueueItemApproval,
} from '@goodboy/db';
import type { ResolveQueueItemWithThread } from '@goodboy/types';
import { integrateWorktreeCandidate } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { withCandidateLock } from './candidateLock';
import { loadResolveCandidatesInto } from './loadResolveCandidatesInto';
import { loadResolveQueueItemsInto } from './loadResolveQueueItemsInto';
import {
  UNCAPTURED_WORK_ON_BRANCH,
  recoverUncapturedResolveWork,
} from './recoverUncapturedResolveWork';
import type { ItemRevisionParams, SliceParams } from './types';

type Params = SliceParams & ItemRevisionParams;
type Covered = {
  readonly queueItemId: string;
  readonly itemRevision: number;
  readonly entry: ResolveQueueItemWithThread | undefined;
};

export const PARTIAL_ACCEPTANCE =
  'This change also answers comments you left for later. Accept them together, or take those back up first';
export const STALE_APPROVAL = 'Approval revision is stale';

const hashReply = async ({ reply }: { readonly reply: string }): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reply));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
};

export const acceptResolveQueueItem = async ({
  set,
  get,
  sessionId,
  itemId,
  revision,
  reply,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  const pending = await recoverUncapturedResolveWork({ set, get, sessionId });
  if (pending !== null) {
    throw new Error(UNCAPTURED_WORK_ON_BRANCH);
  }
  const replyHash = await hashReply({ reply });
  const candidate = await getReadyResolveCandidateForItem({ db, queueItemId: itemId });
  if (candidate === null) {
    const accepted = await setResolveQueueItemApproval({
      db,
      sessionId,
      itemId,
      revision,
      replyHash,
    });
    if (!accepted) {
      throw new Error(STALE_APPROVAL);
    }
    await loadResolveQueueItemsInto({ set, sessionId });
    return;
  }
  const entries = await listResolveQueueItems({ db, sessionId });
  const target = entries.find((entry) => entry.item.id === itemId);
  if (target === undefined || target.item.candidateRevision !== revision) {
    throw new Error(STALE_APPROVAL);
  }
  const members = await listResolveCandidateItems({ db, candidateId: candidate.id });
  const covered: ReadonlyArray<Covered> = members.map((member) => ({
    queueItemId: member.queueItemId,
    itemRevision: member.itemRevision,
    entry: entries.find((entry) => entry.item.id === member.queueItemId),
  }));
  if (covered.some(({ entry }) => entry === undefined)) {
    throw new Error('This change covers a comment that is no longer open. Ask for the fix again');
  }
  if (covered.some(({ entry }) => entry?.item.approvalState === 'deferred')) {
    throw new Error(PARTIAL_ACCEPTANCE);
  }
  if (
    covered.some(
      ({ itemRevision, entry }) =>
        entry?.item.candidateRevision !== itemRevision || entry.thread.revision !== itemRevision,
    )
  ) {
    throw new Error(STALE_APPROVAL);
  }
  const approvals = await Promise.all(
    covered.map(async ({ queueItemId, itemRevision, entry }) => ({
      queueItemId,
      revision: itemRevision,
      replyHash:
        queueItemId === itemId
          ? replyHash
          : await hashReply({ reply: entry?.thread.replyDraft ?? '' }),
    })),
  );
  const integratedSha = await withCandidateLock({
    worktreePath: candidate.worktreePath,
    holder: `accept:${candidate.id}`,
    run: () =>
      integrateWorktreeCandidate({
        worktreePath: candidate.worktreePath,
        candidateId: candidate.id,
        candidateSha: candidate.candidateSha,
        expectedHead: candidate.baseSha,
      }),
  });
  await finalizeResolveCandidateIntegration({
    db,
    candidateId: candidate.id,
    integratedSha,
    approvals,
  });
  await loadResolveQueueItemsInto({ set, sessionId });
  await loadResolveCandidatesInto({ set, sessionId });
};
