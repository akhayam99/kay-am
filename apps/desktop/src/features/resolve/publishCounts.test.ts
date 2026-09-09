import { describe, expect, it } from 'vitest';
import type {
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import { acceptedPublishCounts } from './publishCounts';

const sessionId = 'session' as SessionId;
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
  replyDraft: 'Fixed',
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
const item: ResolveQueueItem = {
  id: 'item',
  sessionId,
  threadId: 'thread',
  generation: 0,
  reopenedFromItemId: null,
  candidateRevision: 2,
  approvalState: 'accepted',
  approvedRevision: 2,
  approvedReplyHash: 'hash',
  integratedSha: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe('acceptedPublishCounts', () => {
  it('counts the commit and the reply behind an accepted fix', () => {
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [{ item, thread }];
    expect(acceptedPublishCounts({ entries })).toEqual({ commits: 1, replies: 1, notes: 0 });
  });

  it('counts a refusal as a reply to send and never as a commit to push', () => {
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [
      { item: { ...item, approvalState: 'wont_fix' }, thread },
    ];
    expect(acceptedPublishCounts({ entries })).toEqual({ commits: 0, replies: 1, notes: 0 });
  });

  it('keeps an accepted commit while a refusal beside it adds only its reply', () => {
    const other: ResolveThread = { ...thread, id: 'row-2', threadId: 'thread-2' };
    const entries: ReadonlyArray<ResolveQueueItemWithThread> = [
      { item, thread },
      {
        item: { ...item, id: 'item-2', threadId: 'thread-2', approvalState: 'wont_fix' },
        thread: other,
      },
    ];
    expect(acceptedPublishCounts({ entries })).toEqual({ commits: 1, replies: 2, notes: 0 });
  });
});
