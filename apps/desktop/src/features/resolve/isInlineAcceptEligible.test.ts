import { describe, expect, it } from 'vitest';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import {
  isAcceptAllEligible,
  isInlineAcceptEligible,
  type ResolveQueueChecksSummary,
} from './isInlineAcceptEligible';
import type { ResolveQueueRow } from './buildResolveQueueRows';

const sessionId = 'session' as SessionId;

const greenChecks: ResolveQueueChecksSummary = {
  additions: 3,
  deletions: 1,
  passCount: 12,
  totalCount: 12,
};

const baseItem: ResolveQueueItem = {
  id: 'item',
  sessionId,
  threadId: 'thread',
  generation: 0,
  reopenedFromItemId: null,
  candidateRevision: 1,
  approvalState: 'none',
  approvedRevision: null,
  approvedReplyHash: null,
  integratedSha: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};

const baseThread: ResolveThread = {
  id: 'row',
  sessionId,
  projectId: null,
  prNumber: 1,
  threadId: 'thread',
  originKind: 'review_comment',
  state: 'open',
  stateReason: null,
  revision: 1,
  activeAttemptId: null,
  disposition: null,
  replyDraft: null,
  commitShas: null,
  question: null,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: 1,
  updatedAt: 1,
};

const row = ({
  threadId,
  coveredThreadIds = [],
}: {
  readonly threadId: string;
  readonly coveredThreadIds?: ReadonlyArray<string>;
}): ResolveQueueRow => ({
  item: { ...baseItem, id: `item-${threadId}`, threadId },
  thread: { ...baseThread, id: `row-${threadId}`, threadId },
  status: 'for_you',
  attempt: null,
  reviewerNote: null,
  proposal: null,
  coveredThreadIds,
  delivery: null,
});

describe('isInlineAcceptEligible', () => {
  it('is eligible when for_you, checks are all green and the change is small', () => {
    expect(isInlineAcceptEligible({ status: 'for_you', checks: greenChecks })).toBe(true);
  });

  it('is not eligible for any status other than for_you', () => {
    expect(isInlineAcceptEligible({ status: 'agent_asked', checks: greenChecks })).toBe(false);
    expect(isInlineAcceptEligible({ status: 'ready_to_push', checks: greenChecks })).toBe(false);
  });

  it('is not eligible when checks are missing or not all green', () => {
    expect(isInlineAcceptEligible({ status: 'for_you', checks: null })).toBe(false);
    expect(
      isInlineAcceptEligible({
        status: 'for_you',
        checks: { ...greenChecks, passCount: 11 },
      }),
    ).toBe(false);
    expect(
      isInlineAcceptEligible({
        status: 'for_you',
        checks: { ...greenChecks, totalCount: 0, passCount: 0 },
      }),
    ).toBe(false);
  });

  it('is not eligible when the change is large', () => {
    expect(
      isInlineAcceptEligible({
        status: 'for_you',
        checks: { ...greenChecks, additions: 40, deletions: 10 },
      }),
    ).toBe(false);
  });
});

describe('isAcceptAllEligible', () => {
  it('is eligible only when every for_you row is green and none covers several comments', () => {
    const rows = [row({ threadId: 't1' }), row({ threadId: 't2' })];
    const checksByThreadId = new Map([
      ['t1', greenChecks],
      ['t2', greenChecks],
    ]);
    expect(isAcceptAllEligible({ rows, checksByThreadId })).toBe(true);
  });

  it('is not eligible when a row covers several comments', () => {
    const rows = [row({ threadId: 't1', coveredThreadIds: ['t2'] }), row({ threadId: 't2' })];
    const checksByThreadId = new Map([
      ['t1', greenChecks],
      ['t2', greenChecks],
    ]);
    expect(isAcceptAllEligible({ rows, checksByThreadId })).toBe(false);
  });

  it('is not eligible when any row is not green', () => {
    const rows = [row({ threadId: 't1' }), row({ threadId: 't2' })];
    const checksByThreadId = new Map<string, ResolveQueueChecksSummary | null>([
      ['t1', greenChecks],
      ['t2', null],
    ]);
    expect(isAcceptAllEligible({ rows, checksByThreadId })).toBe(false);
  });

  it('is not eligible when there are no for_you rows', () => {
    expect(isAcceptAllEligible({ rows: [], checksByThreadId: new Map() })).toBe(false);
  });
});
