import { describe, expect, it, vi } from 'vitest';
import type { MountId, SessionId } from '@goodboy/types';
import { openMountRequest } from './openMountRequest';
import type { GetFn, SetFn } from './types';

const SESSION_ID = 'session-1' as SessionId;
const MOUNT_ID = 'mount-1' as MountId;

const harness = () => {
  const state = {
    setSessionActiveMount: vi.fn(async () => undefined),
    selectSessionPr: vi.fn(async () => undefined),
    setSessionStudio: vi.fn(),
    setReviewLensIntent: vi.fn(),
    setActiveLens: vi.fn(),
  };
  const get = vi.fn(() => state) as unknown as GetFn;
  const set = vi.fn() as unknown as SetFn;
  return { state, run: openMountRequest(set, get) };
};

describe('openMountRequest', () => {
  it('opens an existing github request in review, on the mount it belongs to', async () => {
    const { state, run } = harness();

    await run({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      provider: 'github',
      requestNumber: 12,
    });

    expect(state.setSessionActiveMount).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
    });
    expect(state.selectSessionPr).toHaveBeenCalledWith(SESSION_ID, 12, MOUNT_ID);
    expect(state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID, prNumber: 12 },
    });
    expect(state.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'review');
    expect(state.setSessionStudio).not.toHaveBeenCalled();
  });

  it('opens review on the create mode when the mount carries no request yet', async () => {
    const { state, run } = harness();

    await run({ sessionId: SESSION_ID, mountId: MOUNT_ID, provider: 'github' });

    expect(state.selectSessionPr).not.toHaveBeenCalled();
    expect(state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID, mode: 'create_pr' },
    });
    expect(state.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'review');
  });

  it('carries a thread into the review intent', async () => {
    const { state, run } = harness();

    await run({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      provider: 'github',
      requestNumber: 12,
      threadId: 'PRRT_1',
    });

    expect(state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID, threadId: 'PRRT_1', prNumber: 12 },
    });
  });

  it('keeps gitlab and bitbucket on their own mount scoped studios', async () => {
    const gitlab = harness();
    await gitlab.run({ sessionId: SESSION_ID, mountId: MOUNT_ID, provider: 'gitlab' });
    expect(gitlab.state.setSessionStudio).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'mr',
      mountId: MOUNT_ID,
    });
    expect(gitlab.state.setActiveLens).not.toHaveBeenCalled();

    const bitbucket = harness();
    await bitbucket.run({ sessionId: SESSION_ID, mountId: MOUNT_ID, provider: 'bitbucket' });
    expect(bitbucket.state.setSessionStudio).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'bitbucket',
      mountId: MOUNT_ID,
    });
    expect(bitbucket.state.setReviewLensIntent).not.toHaveBeenCalled();
  });
});
