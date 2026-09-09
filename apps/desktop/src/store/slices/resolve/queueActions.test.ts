import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  insertResolveQueueItem,
  listResolveQueueItems,
  migrate,
  upsertResolveThread,
  type Database,
} from '@goodboy/db';
import { approvedPublicationScope } from './approvedPublicationScope';
import { deriveResolveQueueStatus } from './deriveResolveQueueStatus';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import { createResolveSlice } from './index';
import {
  EMPTY_REFUSAL_REPLY,
  REFUSAL_AFTER_INTEGRATION,
  REFUSAL_REPLY_OUT_OF_DATE,
} from './refuseResolveQueueItem';
import { resolveInitialState } from './state';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), exec: vi.fn() }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: h }));

const sessionId = 'session' as SessionId;
const thread: ResolveThread = {
  id: 'thread-row',
  sessionId,
  projectId: null,
  prNumber: 1,
  threadId: 'thread',
  originKind: 'review_comment',
  state: 'fixed',
  stateReason: null,
  revision: 2,
  activeAttemptId: null,
  disposition: 'reply',
  replyDraft: 'Reply',
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
  integratedSha: null,
  deferredAt: null,
  deliveredAt: null,
  supersededAt: null,
  createdAt: 1,
  updatedAt: 1,
};
let db: Database;

const createHarness = () => {
  const store = createStore(() => ({
    ...resolveInitialState,
    sessionResolveThreads: { [sessionId]: [thread] },
  }));
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  return { store, actions: createResolveSlice({ set, get }) };
};

beforeEach(async () => {
  db = makeTestDatabase();
  h.exec.mockReset().mockImplementation(db.exec);
  h.execute.mockReset().mockImplementation(db.execute);
  h.select.mockReset().mockImplementation(db.select);
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

describe('resolve queue actions', () => {
  it('accepts the observed revision and fails loudly for a stale revision', async () => {
    const live = createHarness();
    await expect(
      live.actions.acceptResolveQueueItem({
        sessionId,
        itemId: item.id,
        revision: 1,
        reply: 'Old',
      }),
    ).rejects.toThrow('stale');
    await live.actions.acceptResolveQueueItem({
      sessionId,
      itemId: item.id,
      revision: 2,
      reply: 'Reply',
    });
    expect(live.store.getState().sessionResolveQueueItems[sessionId]?.[0]?.item).toMatchObject({
      approvalState: 'accepted',
      approvedRevision: 2,
    });
  });

  it('defers an item', async () => {
    const live = createHarness();
    await live.actions.deferResolveQueueItem({ sessionId, itemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe(
      'deferred',
    );
  });

  it('takes up a deferred item', async () => {
    const live = createHarness();
    await live.actions.deferResolveQueueItem({ sessionId, itemId: item.id });
    await live.actions.takeUpResolveQueueItem({ sessionId, itemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe('none');
  });

  it('refuses a comment only with a reply the reviewer can read', async () => {
    const live = createHarness();
    await expect(
      live.actions.refuseResolveQueueItem({
        sessionId,
        itemId: item.id,
        revision: 2,
        reply: '   ',
      }),
    ).rejects.toThrow(EMPTY_REFUSAL_REPLY);
    expect(EMPTY_REFUSAL_REPLY).toBe('Write the reply the reviewer will read before you refuse');
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe('none');
    await live.actions.refuseResolveQueueItem({
      sessionId,
      itemId: item.id,
      revision: 2,
      reply: 'Reply',
    });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item).toMatchObject({
      approvalState: 'wont_fix',
      approvedRevision: 2,
    });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvedReplyHash).not.toBe(
      null,
    );
  });

  it('refuses to refuse with a reply that drifted from the saved draft', async () => {
    const live = createHarness();
    await expect(
      live.actions.refuseResolveQueueItem({
        sessionId,
        itemId: item.id,
        revision: 2,
        reply: 'We are keeping this as it is',
      }),
    ).rejects.toThrow(REFUSAL_REPLY_OUT_OF_DATE);
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe('none');
  });

  it('will not refuse a comment whose fix is already on the branch', async () => {
    const live = createHarness();
    await db.execute("UPDATE resolve_queue_items SET integrated_sha = 'abc' WHERE id = ?", [
      item.id,
    ]);
    await expect(
      live.actions.refuseResolveQueueItem({
        sessionId,
        itemId: item.id,
        revision: 2,
        reply: 'Reply',
      }),
    ).rejects.toThrow(REFUSAL_AFTER_INTEGRATION);
    expect(REFUSAL_AFTER_INTEGRATION).toBe('Fix already integrated');
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item.approvalState).toBe('none');
  });

  it('drops a saved refusal out of publication once the comment changes', async () => {
    const live = createHarness();
    await live.actions.refuseResolveQueueItem({
      sessionId,
      itemId: item.id,
      revision: 2,
      reply: 'Reply',
    });
    expect([...(await approvedPublicationScope({ sessionId })).refusedThreadIds]).toEqual([
      'thread',
    ]);
    await upsertResolveThread({
      db,
      row: { ...thread, replyDraft: 'Rewritten' },
      expectedRevision: 2,
    });
    const scope = await approvedPublicationScope({ sessionId });
    expect([...scope.refusedThreadIds]).toEqual([]);
    expect([...scope.threadIds]).toEqual([]);
    const entry = (await listResolveQueueItems({ db, sessionId }))[0];
    expect(
      deriveResolveQueueStatus({
        item: entry?.item ?? item,
        thread: entry?.thread ?? thread,
        activeAttempt: null,
        deliveryReceipts: [],
      }),
    ).toBe('changed_since_accepted');
  });

  it('takes up a refused item back into undecided', async () => {
    const live = createHarness();
    await live.actions.refuseResolveQueueItem({
      sessionId,
      itemId: item.id,
      revision: 2,
      reply: 'Reply',
    });
    await live.actions.takeUpResolveQueueItem({ sessionId, itemId: item.id });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item).toMatchObject({
      approvalState: 'none',
      approvedRevision: null,
      approvedReplyHash: null,
    });
  });

  it('reopens an item as a new generation', async () => {
    const live = createHarness();
    await live.actions.reopenResolveQueueItem({ sessionId, itemId: item.id, revision: 2 });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item).toMatchObject({
      generation: 1,
      reopenedFromItemId: item.id,
    });
  });
});
