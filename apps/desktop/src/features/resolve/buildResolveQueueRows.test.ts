import { describe, expect, it } from 'vitest';
import type {
  PrComment,
  ResolveAttempt,
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import { buildResolveQueueRows } from './buildResolveQueueRows';

const sessionId = 'session' as SessionId;

const item = ({
  threadId,
  approvalState = 'none',
}: {
  readonly threadId: string;
  readonly approvalState?: ResolveQueueItem['approvalState'];
}): ResolveQueueItem => ({
  id: `item-${threadId}`,
  sessionId,
  threadId,
  generation: 0,
  reopenedFromItemId: null,
  candidateRevision: 1,
  approvalState,
  approvedRevision: null,
  approvedReplyHash: null,
  integratedSha: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
});

const thread = ({
  threadId,
  activeAttemptId = null,
  replyDraft = null,
}: {
  readonly threadId: string;
  readonly activeAttemptId?: string | null;
  readonly replyDraft?: string | null;
}): ResolveThread => ({
  id: `row-${threadId}`,
  sessionId,
  projectId: null,
  prNumber: 1,
  threadId,
  originKind: 'review_comment',
  state: 'open',
  stateReason: null,
  revision: 1,
  activeAttemptId,
  disposition: null,
  replyDraft,
  commitShas: null,
  question: null,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: 1,
  updatedAt: 1,
});

const comment = ({
  threadId,
  createdAt,
  body,
}: {
  readonly threadId: string;
  readonly createdAt: string;
  readonly body: string;
}): PrComment => ({
  id: `comment-${threadId}`,
  author: 'reviewer',
  authorAvatarUrl: null,
  body,
  createdAt,
  url: `https://example.com/${threadId}`,
  source: 'review',
  path: 'src/index.ts',
  line: 12,
  threadId,
});

const attempt: ResolveAttempt = {
  id: 'attempt-1',
  sessionId,
  agentId: 'agent-1' as ResolveAttempt['agentId'],
  prNumber: 1,
  threadIds: ['t1', 't2'],
  provider: 'anthropic',
  model: 'sonnet-5',
  effort: 'high',
  instructions: null,
  phase: 'running',
  startedAt: 1,
  endedAt: null,
  error: null,
  createdAt: 1,
};

describe('buildResolveQueueRows', () => {
  it('attaches the reviewer note, status and active attempt for each entry', () => {
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [
      { item: item({ threadId: 't1' }), thread: thread({ threadId: 't1' }) },
    ];
    const rows = buildResolveQueueRows({
      entries,
      attempts: [],
      deliveryReceipts: [],
      comments: [comment({ threadId: 't1', createdAt: '2026-01-01T00:00:00.000Z', body: 'Fix this' })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('for_you');
    expect(rows[0]?.attempt).toBeNull();
    expect(rows[0]?.reviewerNote).toMatchObject({
      body: 'Fix this',
      location: 'src/index.ts:12',
      path: 'src/index.ts',
    });
  });

  it('marks threads that share an active attempt as covered by each other', () => {
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [
      { item: item({ threadId: 't1' }), thread: thread({ threadId: 't1', activeAttemptId: attempt.id }) },
      { item: item({ threadId: 't2' }), thread: thread({ threadId: 't2', activeAttemptId: attempt.id }) },
    ];
    const rows = buildResolveQueueRows({
      entries,
      attempts: [attempt],
      deliveryReceipts: [],
      comments: [],
    });
    expect(rows[0]?.coveredThreadIds).toEqual(['t2']);
    expect(rows[1]?.coveredThreadIds).toEqual(['t1']);
    expect(rows[0]?.attempt).toBe(attempt);
  });

  it('leaves the reviewer note null when no matching comment exists', () => {
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [
      { item: item({ threadId: 't1' }), thread: thread({ threadId: 't1' }) },
    ];
    const rows = buildResolveQueueRows({ entries, attempts: [], deliveryReceipts: [], comments: [] });
    expect(rows[0]?.reviewerNote).toBeNull();
  });
});
