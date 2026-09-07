import type { PendingResolutionOutcome, SessionId } from '@goodboy/types';
import type { UpdateParams } from '../resolve/types';
import type { GetFn } from './types';

export type Closure = {
  readonly commitSha?: string;
  readonly reason?: string;
  readonly reply?: string;
};

export const deriveClosureOutcome = ({
  closure,
}: {
  readonly closure: Closure | undefined;
}): PendingResolutionOutcome | null => {
  const commitSha = closure?.commitSha ?? '';
  const reason = closure?.reason ?? '';
  const reply = closure?.reply ?? '';
  if (commitSha === '' && reason === '' && reply === '') {
    return null;
  }
  if (commitSha !== '') {
    return 'resolved';
  }
  if (reason !== '') {
    return 'wontfix';
  }
  return 'analyzed';
};

type PatchParams = {
  readonly outcome: PendingResolutionOutcome | null;
  readonly closure: Closure | undefined;
  readonly isExplicitClose: boolean;
};

export const closurePatch = ({
  outcome,
  closure,
  isExplicitClose,
}: PatchParams): UpdateParams['patch'] => {
  const reply = closure?.reply ?? null;
  if (outcome === 'resolved') {
    return {
      state: 'fixed',
      disposition: 'fix',
      commitShas: [closure?.commitSha ?? ''],
      stateReason: null,
      ...(reply !== null && { replyDraft: reply }),
    };
  }
  if (outcome === 'wontfix') {
    const reason = closure?.reason ?? '';
    return {
      state: 'answered',
      disposition: 'no_change',
      commitShas: null,
      stateReason: `wontfix:${reason}`,
      replyDraft: reply ?? reason,
    };
  }
  if (outcome === 'analyzed') {
    return {
      state: 'answered',
      disposition: 'reply',
      commitShas: null,
      stateReason: null,
      ...(reply !== null && { replyDraft: reply }),
    };
  }
  return {
    state: 'answered',
    disposition: isExplicitClose ? 'reply' : null,
    commitShas: null,
    stateReason: null,
    ...(reply !== null && { replyDraft: reply }),
  };
};

type WriteParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly prNumber?: number;
  readonly outcome: PendingResolutionOutcome | null;
  readonly closure: Closure | undefined;
  readonly isExplicitClose: boolean;
  readonly replyPostedAt?: number | null;
};

export const writeClosureRow = async ({
  get,
  sessionId,
  threadId,
  prNumber,
  outcome,
  closure,
  isExplicitClose,
  replyPostedAt,
}: WriteParams): Promise<void> => {
  await get().updateResolveThread({
    sessionId,
    threadId,
    ...(prNumber !== undefined && { prNumber }),
    patch: {
      ...closurePatch({ outcome, closure, isExplicitClose }),
      ...(replyPostedAt != null && { replyPostedAt }),
    },
  });
};
