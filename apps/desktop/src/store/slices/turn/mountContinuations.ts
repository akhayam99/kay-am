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

const queued = new Map<string, MountContinuation>();
const consumed = new Set<string>();

export const queueMountContinuation = (continuation: MountContinuation): boolean => {
  if (queued.has(continuation.operationId) || consumed.has(continuation.operationId)) {
    return false;
  }
  queued.set(continuation.operationId, continuation);
  return true;
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
  return owned[owned.length - 1] ?? null;
};

export const clearMountContinuations = (): void => {
  queued.clear();
  consumed.clear();
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
