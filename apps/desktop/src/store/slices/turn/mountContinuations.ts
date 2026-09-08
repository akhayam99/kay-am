import type { MountId, SessionId } from '@goodboy/types';

export type MountContinuation = Readonly<{
  operationId: string;
  sessionId: SessionId;
  mountId: MountId;
  mountName: string;
  branch: string;
  worktreePath: string;
  origin: 'fork' | 'attach';
}>;

export const MAX_MOUNT_CONTINUATIONS = 3;

export type MountContinuationRefusal = 'already-queued' | 'same-mount' | 'chain-exhausted';

export type MountContinuationOutcome =
  | { readonly queued: true }
  | { readonly queued: false; readonly refusal: MountContinuationRefusal };

const queued = new Map<string, MountContinuation>();
const consumed = new Set<string>();
const chained = new Map<SessionId, number>();

type QueueParams = {
  readonly continuation: MountContinuation;
  readonly boundMountId?: MountId | null;
};

export const queueMountContinuation = ({
  continuation,
  boundMountId,
}: QueueParams): MountContinuationOutcome => {
  if (queued.has(continuation.operationId) || consumed.has(continuation.operationId)) {
    return { queued: false, refusal: 'already-queued' };
  }
  if (boundMountId != null && boundMountId === continuation.mountId) {
    return { queued: false, refusal: 'same-mount' };
  }
  if ((chained.get(continuation.sessionId) ?? 0) >= MAX_MOUNT_CONTINUATIONS) {
    return { queued: false, refusal: 'chain-exhausted' };
  }
  queued.set(continuation.operationId, continuation);
  return { queued: true };
};

export const mountContinuationRefusal = ({
  refusal,
}: {
  readonly refusal: MountContinuationRefusal;
}): string => {
  if (refusal === 'same-mount') {
    return 'this turn already runs in that mount, so no new turn was started';
  }
  if (refusal === 'chain-exhausted') {
    return `this session already chained ${MAX_MOUNT_CONTINUATIONS} mount turns: finish the work here or ask the operator, no new turn was started`;
  }
  return 'that mount request already started a turn, so no new turn was started';
};

export const resetMountContinuationChain = ({
  sessionId,
}: {
  readonly sessionId: SessionId;
}): void => {
  chained.delete(sessionId);
};

export const pendingMountContinuations = ({
  sessionId,
}: {
  readonly sessionId: SessionId;
}): ReadonlyArray<MountContinuation> =>
  Array.from(queued.values()).filter((entry) => entry.sessionId === sessionId);

export const takeMountContinuation = ({
  sessionId,
}: {
  readonly sessionId: SessionId;
}): MountContinuation | null => {
  const owned = pendingMountContinuations({ sessionId });
  for (const entry of owned) {
    queued.delete(entry.operationId);
    consumed.add(entry.operationId);
  }
  const next = owned[owned.length - 1] ?? null;
  if (next !== null) {
    chained.set(sessionId, (chained.get(sessionId) ?? 0) + 1);
  }
  return next;
};

export const clearMountContinuations = (): void => {
  queued.clear();
  consumed.clear();
  chained.clear();
};

export const mountContinuationPrompt = ({
  continuation,
}: {
  readonly continuation: MountContinuation;
}): string =>
  [
    continuation.origin === 'fork'
      ? `This turn starts in the mount you forked: ${continuation.mountName} (mount ${continuation.mountId}) on branch ${continuation.branch} at ${continuation.worktreePath}.`
      : `This turn starts in the mount you attached: ${continuation.mountName} (mount ${continuation.mountId}) on branch ${continuation.branch} at ${continuation.worktreePath}.`,
    'The previous turn ran in another directory, so nothing it left uncommitted is here. Cherry-pick what belongs on this branch and resolve conflicts normally.',
    'Continue the work you declared when you asked for this mount.',
  ].join('\n');
