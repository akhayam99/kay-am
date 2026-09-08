// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IsoDateTime, MountBranchObservation, MountId, SessionId } from '@goodboy/types';

const { store } = vi.hoisted(() => ({
  store: { resolveMountBranchMismatch: vi.fn(async () => undefined) },
}));

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
}));
vi.mock('../../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { MountBranchDecision } from './MountBranchDecision';

const sessionId = 'session-1' as SessionId;
const mountId = 'mount-1' as MountId;

const observation: MountBranchObservation = {
  mountId,
  sessionId,
  state: 'mismatch',
  recordedBranch: 'ak/part-one',
  observedBranch: 'ak/part-two',
  revision: 3,
  observedAt: '2026-09-08T10:00:00.000Z' as IsoDateTime,
};

const renderDecision = (next: Partial<MountBranchObservation> = {}) =>
  render(
    <MountBranchDecision
      sessionId={sessionId}
      mountId={mountId}
      observation={{ ...observation, ...next }}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('MountBranchDecision', () => {
  it('reads out the recorded branch and the observed one', () => {
    renderDecision();

    expect(screen.getByText('Recorded on ak/part-one, found on ak/part-two.')).toBeDefined();
  });

  it('adopts the observed branch on this mount', async () => {
    renderDecision();

    fireEvent.click(screen.getByRole('button', { name: 'Use this branch here' }));

    await waitFor(() =>
      expect(store.resolveMountBranchMismatch).toHaveBeenCalledWith({
        sessionId,
        mountId,
        resolution: 'adopt-observed',
      }),
    );
  });

  it('forks a second mount when both branches are kept', async () => {
    renderDecision();

    fireEvent.click(screen.getByRole('button', { name: 'Keep both branches' }));

    await waitFor(() =>
      expect(store.resolveMountBranchMismatch).toHaveBeenCalledWith({
        sessionId,
        mountId,
        resolution: 'keep-both',
      }),
    );
  });

  it('offers no resolution for a detached head, only the wording', () => {
    renderDecision({ state: 'detached', observedBranch: null });

    expect(
      screen.getByText('Recorded on ak/part-one, but the worktree sits on a detached HEAD.'),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Use this branch here' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('dismisses itself without resolving anything', () => {
    renderDecision();

    fireEvent.click(screen.getByRole('button', { name: 'Decide later' }));

    expect(screen.queryByRole('button', { name: 'Use this branch here' })).toBeNull();
    expect(store.resolveMountBranchMismatch).not.toHaveBeenCalled();
  });
});
