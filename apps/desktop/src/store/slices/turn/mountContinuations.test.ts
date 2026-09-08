import { beforeEach, describe, expect, it } from 'vitest';
import type { MountId, SessionId } from '@goodboy/types';
import {
  clearMountContinuations,
  mountContinuationPrompt,
  pendingMountContinuations,
  queueMountContinuation,
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
    expect(queueMountContinuation(continuation())).toBe(true);
    expect(queueMountContinuation(continuation({ mountName: 'renamed' }))).toBe(false);

    expect(pendingMountContinuations({ sessionId: SESSION })).toHaveLength(1);
  });

  it('refuses an operation it already handed out, so one fork continues once', () => {
    queueMountContinuation(continuation());
    takeMountContinuation({ sessionId: SESSION });

    expect(queueMountContinuation(continuation())).toBe(false);
    expect(takeMountContinuation({ sessionId: SESSION })).toBeNull();
  });

  it('hands the session its latest target once and leaves nothing behind', () => {
    queueMountContinuation(continuation());
    queueMountContinuation(continuation({ operationId: 'req-2', mountId: 'mount-3' as MountId }));

    expect(takeMountContinuation({ sessionId: SESSION })?.mountId).toBe('mount-3');
    expect(takeMountContinuation({ sessionId: SESSION })).toBeNull();
  });

  it('never hands one session the continuation another session asked for', () => {
    queueMountContinuation(continuation({ sessionId: OTHER_SESSION }));

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
