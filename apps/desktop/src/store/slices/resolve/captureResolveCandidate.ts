import {
  getResolveCandidate,
  insertResolveCandidateItem,
  listResolveQueueItems,
  markOverlappingResolveCandidatesStale,
  markResolveCandidateReady,
  setResolveCandidateState,
} from '@goodboy/db';
import { quarantineWorktreeCandidate } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { withCandidateLock } from './candidateLock';
import { loadResolveCandidatesInto } from './loadResolveCandidatesInto';
import type { CandidateCaptureParams, SliceParams } from './types';

type Params = SliceParams & CandidateCaptureParams;

export const captureResolveCandidate = async ({
  set,
  sessionId,
  attemptId,
  threadIds,
}: Params): Promise<string | null> => {
  const db = tauriDatabase;
  const candidate = await getResolveCandidate({ db, candidateId: attemptId });
  if (candidate === null || candidate.state !== 'building') {
    return null;
  }
  const covered = (await listResolveQueueItems({ db, sessionId })).filter(
    ({ item, thread }) =>
      threadIds.includes(item.threadId) &&
      item.approvalState !== 'accepted' &&
      thread.state !== 'closed',
  );
  const quarantined = await withCandidateLock({
    worktreePath: candidate.worktreePath,
    holder: `candidate:${candidate.id}`,
    run: () =>
      quarantineWorktreeCandidate({
        worktreePath: candidate.worktreePath,
        candidateId: candidate.id,
        baseSha: candidate.baseSha,
      }),
  });
  if (quarantined.sha === null || covered.length === 0) {
    await setResolveCandidateState({ db, candidateId: candidate.id, state: 'discarded' });
    await loadResolveCandidatesInto({ set, sessionId });
    return null;
  }
  for (const { item } of covered) {
    await insertResolveCandidateItem({
      db,
      item: {
        candidateId: candidate.id,
        queueItemId: item.id,
        itemRevision: item.candidateRevision,
      },
    });
  }
  await markOverlappingResolveCandidatesStale({ db, candidateId: candidate.id });
  const ready = await markResolveCandidateReady({
    db,
    candidateId: candidate.id,
    candidateSha: quarantined.sha,
  });
  await loadResolveCandidatesInto({ set, sessionId });
  return ready ? quarantined.sha : null;
};
