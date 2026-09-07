import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WriterLeaseEvent = {
  readonly path: string;
  readonly holder: string;
  readonly reason: string;
};

const hoisted = vi.hoisted(() => ({
  unlisten: vi.fn(),
  listen: vi.fn(),
  isMainWindow: vi.fn(() => true),
  drainResolveWorktree: vi.fn(async () => undefined),
  reconcileResolveDrains: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: hoisted.listen }));
vi.mock('../../workspace/window', () => ({ isMainWindow: hoisted.isMainWindow }));
vi.mock('../../../store/store', () => ({
  useAppStore: {
    getState: () => ({
      drainResolveWorktree: hoisted.drainResolveWorktree,
      reconcileResolveDrains: hoisted.reconcileResolveDrains,
    }),
  },
}));

import { startWorktreeWriterBridge } from './worktreeWriterBridge';

const emitLease = async (payload: WriterLeaseEvent): Promise<void> => {
  const handler = hoisted.listen.mock.calls[0]?.[1] as
    ((event: { payload: WriterLeaseEvent }) => void) | undefined;
  handler?.({ payload });
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  hoisted.listen.mockReset().mockResolvedValue(hoisted.unlisten);
  hoisted.isMainWindow.mockReturnValue(true);
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.clearAllMocks();
});

describe('worktree writer bridge', () => {
  it('drains the worktree a lease event names', async () => {
    await startWorktreeWriterBridge();

    expect(hoisted.listen.mock.calls[0]?.[0]).toBe('worktree_writer_event');
    await emitLease({ path: '/repo/one', holder: 'agent-1', reason: 'released' });

    expect(hoisted.drainResolveWorktree).toHaveBeenCalledWith({ worktreePath: '/repo/one' });
  });

  it('reconciles once on start and again on every interval', async () => {
    await startWorktreeWriterBridge();

    expect(hoisted.reconcileResolveDrains).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hoisted.reconcileResolveDrains).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(hoisted.reconcileResolveDrains).toHaveBeenCalledTimes(3);
  });

  it('stops listening and reconciling once torn down', async () => {
    const stop = await startWorktreeWriterBridge();

    stop();

    expect(hoisted.unlisten).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(hoisted.reconcileResolveDrains).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way outside the main window', async () => {
    hoisted.isMainWindow.mockReturnValue(false);

    await startWorktreeWriterBridge();

    expect(hoisted.listen).not.toHaveBeenCalled();
    expect(hoisted.reconcileResolveDrains).not.toHaveBeenCalled();
  });
});
