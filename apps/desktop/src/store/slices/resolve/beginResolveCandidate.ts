import { getResolveCandidate, insertResolveCandidate, listResolveCandidates } from '@goodboy/db';
import { worktreeStatus } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { resolveWorktreePath } from './resolveWorktreePath';
import type { CandidateBeginParams, SliceParams } from './types';

type Params = SliceParams & CandidateBeginParams;

export const beginResolveCandidate = async ({
  get,
  sessionId,
  attemptId,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  const existing = await getResolveCandidate({ db, candidateId: attemptId });
  if (existing !== null) {
    return;
  }
  const worktreePath = await resolveWorktreePath({ get, sessionId });
  if (worktreePath === null) {
    return;
  }
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  const head = status?.head ?? '';
  if (head === '') {
    return;
  }
  const now = Date.now();
  await insertResolveCandidate({
    db,
    candidate: {
      id: attemptId,
      sessionId,
      revision: (await listResolveCandidates({ db, sessionId })).length + 1,
      baseSha: head,
      candidateSha: head,
      worktreePath,
      state: 'building',
      integratedSha: null,
      createdAt: now,
      updatedAt: now,
    },
  });
};
