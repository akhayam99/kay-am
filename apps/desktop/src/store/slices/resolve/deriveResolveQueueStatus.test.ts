import { describe, expect, it } from 'vitest';
import type {
  ResolveAttempt,
  ResolvePublicationThread,
  ResolveQueueItem,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import { deriveResolveQueueStatus, type ResolveQueueStatus } from './deriveResolveQueueStatus';

const sessionId = 'session' as SessionId;
const item: ResolveQueueItem = {
  id: 'item',
  sessionId,
  threadId: 'thread',
  generation: 0,
  reopenedFromItemId: null,
  candidateRevision: 2,
  approvalState: 'none',
  approvedRevision: null,
  approvedReplyHash: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};
const thread: ResolveThread = {
  id: 'row',
  sessionId,
  projectId: null,
  prNumber: 1,
  threadId: 'thread',
  originKind: 'review_comment',
  state: 'fixed',
  stateReason: null,
  revision: 2,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: null,
  commitShas: ['abc'],
  question: null,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: 1,
  updatedAt: 1,
};
const attempt: ResolveAttempt = {
  id: 'attempt',
  sessionId,
  agentId: 'agent' as ResolveAttempt['agentId'],
  prNumber: 1,
  threadIds: ['thread'],
  provider: 'test',
  model: 'test',
  effort: null,
  instructions: null,
  phase: 'running',
  startedAt: 1,
  endedAt: null,
  error: null,
  createdAt: 1,
};
const receipt: ResolvePublicationThread = {
  publicationId: 'publication',
  threadId: 'thread',
  revision: 2,
  priorState: 'fixed',
  replyBody: null,
  replyPhase: 'skipped',
  replyId: null,
  replyPostedAt: null,
  resolvePhase: 'resolved',
  resolvedAt: 5,
  error: null,
};

type Case = {
  readonly status: ResolveQueueStatus;
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly attempt: ResolveAttempt | null;
  readonly receipts: ReadonlyArray<ResolvePublicationThread>;
};

describe('deriveResolveQueueStatus', () => {
  it.each<Case>([
    { status: 'for_you', item, thread, attempt: null, receipts: [] },
    {
      status: 'agent_asked',
      item,
      thread: { ...thread, state: 'needs_answer', question: 'Which?' },
      attempt: null,
      receipts: [],
    },
    { status: 'working', item, thread, attempt, receipts: [] },
    {
      status: 'ready_to_push',
      item: { ...item, approvalState: 'accepted', approvedRevision: 2 },
      thread,
      attempt: null,
      receipts: [],
    },
    {
      status: 'pushed',
      item: { ...item, approvalState: 'accepted', approvedRevision: 2, deliveredAt: 5 },
      thread,
      attempt: null,
      receipts: [receipt],
    },
    {
      status: 'later',
      item: { ...item, approvalState: 'deferred', deferredAt: 4 },
      thread,
      attempt: null,
      receipts: [],
    },
    {
      status: 'changed_since_accepted',
      item: { ...item, approvalState: 'accepted', approvedRevision: 2 },
      thread: { ...thread, revision: 3 },
      attempt: null,
      receipts: [],
    },
  ])(
    'returns $status',
    ({ status, item: candidate, thread: row, attempt: activeAttempt, receipts }) => {
      expect(
        deriveResolveQueueStatus({
          item: candidate,
          thread: row,
          activeAttempt,
          deliveryReceipts: receipts,
        }),
      ).toBe(status);
    },
  );
});
