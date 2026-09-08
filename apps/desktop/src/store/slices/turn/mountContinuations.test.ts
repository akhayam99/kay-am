import { beforeEach, describe, expect, it } from 'vitest';
import type { MountId, SessionId } from '@goodboy/types';
import {
  MAX_MOUNT_CONTINUATIONS,
  clearMountContinuations,
  mountContinuationPrompt,
  pendingMountContinuations,
  queueMountContinuation,
  resetMountContinuationChain,
  takeMountContinuation,
} from './mountContinuations';

const SESSION = 'session-1' as SessionId;
const OTHER_SESSION = 'session-2' as SessionId;

const continuation = (overrides: Record<string, unknown> = {}) => ({
  operationId: 'req-1',
  sessionId: SESSION,
  mountId: 'mount-2' as MountId,
  mountName: 'api 2',
  branch: 'goodboy/second',
  worktreePath: '/repo/api/.goodboy/worktrees/second',
  origin: 'fork' as const,
  ...overrides,
});

beforeEach(() => {
  clearMountContinuations();
});

describe('mount continuations', () => {
  it('keeps one entry per operation id however often the same fork is retried', () => {
    expect(queueMountContinuation({ continuation: continuation() }).queued).toBe(true);
    expect(
      queueMountContinuation({ continuation: continuation({ mountName: 'renamed' }) }).queued,
    ).toBe(false);

    expect(pendingMountContinuations({ sessionId: SESSION })).toHaveLength(1);
  });

  it('refuses an operation it already handed out, so one fork continues once', () => {
    queueMountContinuation({ continuation: continuation() });
    takeMountContinuation({ sessionId: SESSION });

    expect(queueMountContinuation({ continuation: continuation() })).toEqual({
      queued: false,
      refusal: 'already-queued',
    });
    expect(takeMountContinuation({ sessionId: SESSION })).toBeNull();
  });

  it('refuses to continue into the mount the turn already runs in', () => {
    const outcome = queueMountContinuation({
      continuation: continuation(),
      boundMountId: 'mount-2' as MountId,
    });

    expect(outcome).toEqual({ queued: false, refusal: 'same-mount' });
    expect(pendingMountContinuations({ sessionId: SESSION })).toHaveLength(0);
  });

  it('stops the chain at the cap so a broken mount cannot spend turns forever', () => {
    for (let index = 0; index < MAX_MOUNT_CONTINUATIONS; index += 1) {
      const queued = queueMountContinuation({
        continuation: continuation({
          operationId: `req-${index}`,
          mountId: `mount-${index}` as MountId,
        }),
      });
      expect(queued.queued).toBe(true);
      expect(takeMountContinuation({ sessionId: SESSION })).not.toBeNull();
    }

    expect(
      queueMountContinuation({
        continuation: continuation({ operationId: 'req-last', mountId: 'mount-last' as MountId }),
      }),
    ).toEqual({ queued: false, refusal: 'chain-exhausted' });
  });

  it('counts the chain per session and forgets it when the operator speaks again', () => {
    for (let index = 0; index < MAX_MOUNT_CONTINUATIONS; index += 1) {
      queueMountContinuation({
        continuation: continuation({
          operationId: `req-${index}`,
          mountId: `mount-${index}` as MountId,
        }),
      });
      takeMountContinuation({ sessionId: SESSION });
    }

    expect(
      queueMountContinuation({
        continuation: continuation({ operationId: 'other', sessionId: OTHER_SESSION }),
      }).queued,
    ).toBe(true);

    resetMountContinuationChain({ sessionId: SESSION });

    expect(
      queueMountContinuation({
        continuation: continuation({ operationId: 'req-after', mountId: 'mount-after' as MountId }),
      }).queued,
    ).toBe(true);
  });

  it('hands the session its latest target once and leaves nothing behind', () => {
    queueMountContinuation({ continuation: continuation() });
    queueMountContinuation({
      continuation: continuation({ operationId: 'req-2', mountId: 'mount-3' as MountId }),
    });

    expect(takeMountContinuation({ sessionId: SESSION })?.mountId).toBe('mount-3');
    expect(takeMountContinuation({ sessionId: SESSION })).toBeNull();
  });

  it('never hands one session the continuation another session asked for', () => {
    queueMountContinuation({ continuation: continuation({ sessionId: OTHER_SESSION }) });

    expect(takeMountContinuation({ sessionId: SESSION })).toBeNull();
    expect(takeMountContinuation({ sessionId: OTHER_SESSION })?.operationId).toBe('req-1');
  });

  it('tells the continued turn which mount it landed in and what did not follow it', () => {
    const prompt = mountContinuationPrompt({ continuation: continuation() });

    expect(prompt).toContain('mount mount-2');
    expect(prompt).toContain('goodboy/second');
    expect(prompt).toContain('/repo/api/.goodboy/worktrees/second');
    expect(prompt).toContain('Cherry-pick what belongs on this branch');
  });
});
