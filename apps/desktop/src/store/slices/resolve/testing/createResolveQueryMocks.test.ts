import { describe, expect, it } from 'vitest';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import { createResolveQueryMocks } from './createResolveQueryMocks';

const sessionId = 'session' as SessionId;
const otherSessionId = 'other-session' as SessionId;
const thread: ResolveThread = {
  id: 'row',
  sessionId,
  projectId: null,
  prNumber: 1,
  threadId: 'thread',
  originKind: 'review_comment',
  state: 'fixed',
  stateReason: null,
  revision: 0,
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
  candidateRevision: 0,
  approvalState: 'none',
  approvedRevision: null,
  approvedReplyHash: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};

describe('createResolveQueryMocks resolve queue item behavior', () => {
  it('clears deferredAt when approving an item that was deferred', async () => {
    const mocks = createResolveQueryMocks();
    await mocks.upsertResolveThread({ row: thread, expectedRevision: null });
    await mocks.insertResolveQueueItem({
      item: { ...item, approvalState: 'deferred', deferredAt: 9 },
    });
    await expect(
      mocks.setResolveQueueItemApproval({
        sessionId,
        itemId: item.id,
        revision: 0,
        replyHash: 'hash',
      }),
    ).resolves.toBe(true);
    const [row] = await mocks.listResolveQueueItems({ sessionId });
    expect(row?.item.approvalState).toBe('accepted');
    expect(row?.item.deferredAt).toBeNull();
  });

  it('refuses to defer an item from a session that does not own it', async () => {
    const mocks = createResolveQueryMocks();
    await mocks.upsertResolveThread({ row: thread, expectedRevision: null });
    await mocks.insertResolveQueueItem({ item });
    await expect(
      mocks.deferResolveQueueItem({ sessionId: otherSessionId, itemId: item.id }),
    ).resolves.toBe(false);
    const [row] = await mocks.listResolveQueueItems({ sessionId });
    expect(row?.item.approvalState).toBe('none');
  });

  it('refuses to defer an item that is already superseded', async () => {
    const mocks = createResolveQueryMocks();
    await mocks.upsertResolveThread({ row: thread, expectedRevision: null });
    await mocks.insertResolveQueueItem({ item: { ...item, supersededAt: 5 } });
    await expect(
      mocks.deferResolveQueueItem({ sessionId, itemId: item.id }),
    ).resolves.toBe(false);
  });

  it('refuses to defer an item that has already been delivered', async () => {
    const mocks = createResolveQueryMocks();
    await mocks.upsertResolveThread({ row: thread, expectedRevision: null });
    await mocks.insertResolveQueueItem({
      item: { ...item, approvalState: 'accepted', approvedRevision: 0, deliveredAt: 5 },
    });
    await expect(
      mocks.deferResolveQueueItem({ sessionId, itemId: item.id }),
    ).resolves.toBe(false);
    const [row] = await mocks.listResolveQueueItems({ sessionId });
    expect(row?.item.approvalState).toBe('accepted');
    expect(row?.item.deliveredAt).toBe(5);
  });
});
