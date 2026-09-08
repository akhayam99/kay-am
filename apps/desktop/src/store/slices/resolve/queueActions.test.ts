import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  insertResolveQueueItem,
  listResolveQueueItems,
  migrate,
  upsertResolveThread,
  type Database,
} from '@goodboy/db';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type { ResolveQueueItem, ResolveThread, SessionId } from '@goodboy/types';
import { createResolveSlice } from './index';
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

  it('reopens an item as a new generation', async () => {
    const live = createHarness();
    await live.actions.reopenResolveQueueItem({ sessionId, itemId: item.id, revision: 2 });
    expect((await listResolveQueueItems({ db, sessionId }))[0]?.item).toMatchObject({
      generation: 1,
      reopenedFromItemId: item.id,
    });
  });
});
