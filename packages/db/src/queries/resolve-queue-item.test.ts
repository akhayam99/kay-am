import { beforeEach, describe, expect, it } from 'vitest';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from '../migrations/runner';
import type { Database } from '../client';
import { upsertResolveThread } from './resolve-thread';
import {
  deferResolveQueueItem,
  insertResolveQueueItem,
  listResolveQueueItems,
  markResolveQueueItemDelivered,
  reopenResolveQueueItem,
  setResolveQueueItemApproval,
  undeferResolveQueueItem,
} from './resolve-queue-item';

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
  approvalState: 'none',
  approvedRevision: null,
  approvedReplyHash: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};
let db: Database;

beforeEach(async () => {
  db = makeTestDatabase();
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session', 'workspace', 'Goal', 'idle', 1, 1)",
  );
  await upsertResolveThread({ db, row: thread, expectedRevision: null });
  await insertResolveQueueItem({ db, item });
});

describe('resolve queue item queries', () => {
  it('loads each live item with its thread', async () => {
    expect(await listResolveQueueItems({ db, sessionId })).toEqual([{ item, thread }]);
  });

  it('checks both the candidate and current thread revision when accepting', async () => {
    await expect(
      setResolveQueueItemApproval({
        db,
        sessionId,
        itemId: item.id,
        revision: 1,
        replyHash: 'old',
      }),
    ).resolves.toBe(false);
    await expect(
      setResolveQueueItemApproval({
        db,
        sessionId,
        itemId: item.id,
        revision: 2,
        replyHash: 'current',
      }),
    ).resolves.toBe(true);
  });

  it('defers and takes up an item without retaining approval data', async () => {
    await deferResolveQueueItem({ db, sessionId, itemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe(
      'deferred',
    );
    await undeferResolveQueueItem({ db, sessionId, itemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe('none');
  });

  it('supersedes the old item when opening a new generation', async () => {
    const reopened = await reopenResolveQueueItem({
      db,
      sessionId,
      itemId: item.id,
      id: 'item-2',
      candidateRevision: 2,
    });
    expect(reopened).toMatchObject({ id: 'item-2', generation: 1, reopenedFromItemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId })).map(({ item: row }) => row.id)).toEqual(
      ['item-2'],
    );
  });

  it('marks only an accepted item delivered', async () => {
    await expect(
      markResolveQueueItemDelivered({ db, sessionId, itemId: item.id, deliveredAt: 5 }),
    ).resolves.toBe(false);
    await setResolveQueueItemApproval({
      db,
      sessionId,
      itemId: item.id,
      revision: 2,
      replyHash: 'hash',
    });
    await expect(
      markResolveQueueItemDelivered({ db, sessionId, itemId: item.id, deliveredAt: 5 }),
    ).resolves.toBe(true);
  });

  it('refuses to defer an item that has already been delivered', async () => {
    await setResolveQueueItemApproval({
      db,
      sessionId,
      itemId: item.id,
      revision: 2,
      replyHash: 'hash',
    });
    await markResolveQueueItemDelivered({ db, sessionId, itemId: item.id, deliveredAt: 5 });
    await expect(deferResolveQueueItem({ db, sessionId, itemId: item.id })).resolves.toBe(false);
    const [row] = await listResolveQueueItems({ db, sessionId });
    expect(row?.item.approvalState).toBe('accepted');
    expect(row?.item.deliveredAt).toBe(5);
  });

  it('refuses to reopen an item under a session that does not own it', async () => {
    await db.execute(
      "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('other-session', 'workspace', 'Goal', 'idle', 1, 1)",
    );
    const otherSessionId = 'other-session' as SessionId;
    const reopened = await reopenResolveQueueItem({
      db,
      sessionId: otherSessionId,
      itemId: item.id,
      id: 'item-hijack',
      candidateRevision: 2,
    });
    expect(reopened).toBeNull();
    const [row] = await listResolveQueueItems({ db, sessionId });
    expect(row?.item.id).toBe(item.id);
    expect(row?.item.supersededAt).toBeNull();
  });
});
