import {
  insertResolveCandidateItem,
  listResolveCandidates,
  listResolveQueueItems,
  markOverlappingResolveCandidatesStale,
  markResolveCandidateReady,
  setResolveCandidateState,
} from '@goodboy/db';
import type { ResolveCandidate, ResolveUncapturedWork } from '@goodboy/types';
import { quarantineWorktreeCandidate, worktreeStatus } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { withCandidateLock } from './candidateLock';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;
type CandidateParams = { readonly candidate: ResolveCandidate; readonly head: string };

export const UNCAPTURED_WORK_ON_BRANCH =
  'The branch carries work that was never captured. Reload the review to park it first';

const headOf = async ({ worktreePath }: { readonly worktreePath: string }): Promise<string> => {
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  return status?.head ?? '';
};

const messageOf = ({ error }: { readonly error: unknown }): string | null =>
  error instanceof Error ? error.message : null;

export const recoverUncapturedResolveWork = async ({
  set,
  sessionId,
}: Params): Promise<ResolveUncapturedWork | null> => {
  const db = tauriDatabase;
  const remember = ({ pending }: { readonly pending: ResolveUncapturedWork | null }) => {
    set((state) => ({
      sessionResolveUncapturedWork: {
        ...state.sessionResolveUncapturedWork,
        [sessionId]: pending,
      },
    }));
    return pending;
  };
  const building = (await listResolveCandidates({ db, sessionId })).filter(
    (candidate) => candidate.state === 'building',
  );
  if (building.length === 0) {
    return remember({ pending: null });
  }
  const park = async ({
    candidate,
    head,
  }: CandidateParams): Promise<ResolveUncapturedWork | null> => {
    if (head === candidate.baseSha) {
      await setResolveCandidateState({ db, candidateId: candidate.id, state: 'discarded' });
      return null;
    }
    const quarantined = await withCandidateLock({
      worktreePath: candidate.worktreePath,
      holder: `recover:${candidate.id}`,
      run: () =>
        quarantineWorktreeCandidate({
          worktreePath: candidate.worktreePath,
          candidateId: candidate.id,
          baseSha: candidate.baseSha,
        }),
    }).catch((error: unknown) => ({ failure: messageOf({ error }) }));
    if ('failure' in quarantined) {
      return {
        candidateId: candidate.id,
        worktreePath: candidate.worktreePath,
        baseSha: candidate.baseSha,
        head,
        reason: 'quarantine_failed',
        detail: quarantined.failure,
      };
    }
    if (quarantined.sha === null) {
      await setResolveCandidateState({ db, candidateId: candidate.id, state: 'discarded' });
      return null;
    }
    const covered = (await listResolveQueueItems({ db, sessionId })).filter(
      ({ item, thread }) =>
        thread.activeAttemptId === candidate.id &&
        item.approvalState !== 'accepted' &&
        thread.state !== 'closed',
    );
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
    await markResolveCandidateReady({
      db,
      candidateId: candidate.id,
      candidateSha: quarantined.sha,
    });
    return null;
  };
  for (const candidate of building) {
    const head = await headOf({ worktreePath: candidate.worktreePath });
    if (head === '') {
      return remember({
        pending: {
          candidateId: candidate.id,
          worktreePath: candidate.worktreePath,
          baseSha: candidate.baseSha,
          head: '',
          reason: 'worktree_unavailable',
          detail: null,
        },
      });
    }
    const failure = await park({ candidate, head });
    if (failure !== null) {
      return remember({ pending: failure });
    }
  }
  return remember({ pending: null });
};
