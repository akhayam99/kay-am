import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMountRecoveryGuard, runMountRecoveryOnce } from './mountRecoveryGuard';

const SESSION_ID = 'sess-1' as never;

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  resetMountRecoveryGuard();
});

describe('runMountRecoveryOnce', () => {
  it('runs once, then blocks a second call for the same session while it settles', async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
    });

    runMountRecoveryOnce({ sessionId: SESSION_ID, run });
    runMountRecoveryOnce({ sessionId: SESSION_ID, run });
    await flushMicrotasks();

    expect(calls).toBe(1);
  });

  it('clears the running guard when run() rejects asynchronously', async () => {
    const failing = vi.fn(async () => {
      throw new Error('async failure');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runMountRecoveryOnce({ sessionId: SESSION_ID, run: failing });
    await flushMicrotasks();

    const recovered = vi.fn(async () => undefined);
    runMountRecoveryOnce({ sessionId: SESSION_ID, run: recovered });
    await flushMicrotasks();

    expect(recovered).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('clears the running guard when run() throws synchronously', async () => {
    const throwsSync = vi.fn(() => {
      throw new Error('sync failure');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runMountRecoveryOnce({ sessionId: SESSION_ID, run: throwsSync as never });
    await flushMicrotasks();

    const recovered = vi.fn(async () => undefined);
    runMountRecoveryOnce({ sessionId: SESSION_ID, run: recovered });
    await flushMicrotasks();

    expect(recovered).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
