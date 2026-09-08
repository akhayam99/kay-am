import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId } from '@goodboy/types';

const h = vi.hoisted(() => {
  const state = {
    sessionSelectedPrNumber: {} as Record<string, number | null>,
    selectSessionPr: vi.fn(async () => undefined),
    setReviewLensIntent: vi.fn(),
    setActiveLens: vi.fn(),
  };
  return { state };
});

vi.mock('../../store', () => ({
  useAppStore: { getState: () => h.state },
}));

import { openReview } from './openReview';

const SESSION_ID = 'session-1' as SessionId;

beforeEach(() => {
  h.state.sessionSelectedPrNumber = {};
  h.state.selectSessionPr.mockClear();
  h.state.setReviewLensIntent.mockClear();
  h.state.setActiveLens.mockClear();
});

describe('openReview', () => {
  it('lands on the review lens with no intent detail when none is given', () => {
    openReview({ sessionId: SESSION_ID });

    expect(h.state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID },
    });
    expect(h.state.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'review');
    expect(h.state.selectSessionPr).not.toHaveBeenCalled();
  });

  it('carries the thread and the mode into the intent', () => {
    openReview({ sessionId: SESSION_ID, threadId: 'PRRT_7', mode: 'pr_activity' });

    expect(h.state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID, threadId: 'PRRT_7', mode: 'pr_activity' },
    });
  });

  it('switches the selected pull request when the caller names a different one', () => {
    h.state.sessionSelectedPrNumber = { [SESSION_ID]: 12 };

    openReview({ sessionId: SESSION_ID, prNumber: 248 });

    expect(h.state.selectSessionPr).toHaveBeenCalledWith(SESSION_ID, 248);
    expect(h.state.setReviewLensIntent).toHaveBeenCalledWith({
      intent: { sessionId: SESSION_ID, prNumber: 248 },
    });
  });

  it('leaves the selection alone when the pull request is already the selected one', () => {
    h.state.sessionSelectedPrNumber = { [SESSION_ID]: 248 };

    openReview({ sessionId: SESSION_ID, prNumber: 248 });

    expect(h.state.selectSessionPr).not.toHaveBeenCalled();
  });
});
