import { describe, expect, it } from 'vitest';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';
import { groupResolveQueue } from './groupResolveQueue';
import type { ResolveQueueRow } from './buildResolveQueueRows';

const sessionId = 'session' as SessionId;

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
  status,
  reviewerCreatedAtMs,
}: {
  readonly threadId: string;
  readonly status: ResolveQueueStatus;
  readonly reviewerCreatedAtMs: number;
}): ResolveQueueRow => ({
  item: { ...baseItem, id: `item-${threadId}`, threadId },
  thread: { ...baseThread, id: `row-${threadId}`, threadId },
  status,
  attempt: null,
  reviewerNote: {
    body: `body-${threadId}`,
    author: 'reviewer',
    createdAtMs: reviewerCreatedAtMs,
    location: null,
    path: null,
  },
  proposal: null,
  coveredThreadIds: [],
});

describe('groupResolveQueue', () => {
  it('buckets for_you, agent_asked and changed_since_accepted together, ordered oldest first', () => {
    const rows = [
      row({ threadId: 'newest', status: 'for_you', reviewerCreatedAtMs: 300 }),
      row({ threadId: 'oldest', status: 'agent_asked', reviewerCreatedAtMs: 100 }),
      row({ threadId: 'middle', status: 'changed_since_accepted', reviewerCreatedAtMs: 200 }),
    ];
    const groups = groupResolveQueue({ rows });
    expect(groups.forYou.map((entry) => entry.thread.threadId)).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('excludes working, ready_to_push, pushed and later from the for-you bucket', () => {
    const rows = [
      row({ threadId: 'w', status: 'working', reviewerCreatedAtMs: 1 }),
      row({ threadId: 'r', status: 'ready_to_push', reviewerCreatedAtMs: 2 }),
      row({ threadId: 'p', status: 'pushed', reviewerCreatedAtMs: 3 }),
      row({ threadId: 'l', status: 'later', reviewerCreatedAtMs: 4 }),
    ];
    const groups = groupResolveQueue({ rows });
    expect(groups.forYou).toHaveLength(0);
    expect(groups.workingCount).toBe(1);
    expect(groups.readyToPushCount).toBe(1);
    expect(groups.pushed.map((entry) => entry.thread.threadId)).toEqual(['p']);
    expect(groups.later.map((entry) => entry.thread.threadId)).toEqual(['l']);
  });

  it('never counts a later item as pushed or resolved', () => {
    const rows = [row({ threadId: 'l', status: 'later', reviewerCreatedAtMs: 1 })];
    const groups = groupResolveQueue({ rows });
    expect(groups.pushed).toHaveLength(0);
    expect(groups.later).toHaveLength(1);
  });
});
