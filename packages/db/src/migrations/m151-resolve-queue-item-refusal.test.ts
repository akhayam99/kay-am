import { describe, expect, it } from 'vitest';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from './index';
import { migrate } from './runner';

type Item = {
  readonly id: string;
  readonly generation: number;
  readonly reopened_from_item_id: string | null;
  readonly approval_state: string;
  readonly integrated_sha: string | null;
  readonly candidate_revision: number;
  readonly delivered_at: number | null;
};

const before = migrations.filter((migration) => migration.version < 151);

const seed = async () => {
  const db = makeTestDatabase();
  await migrate(db, before);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session', 'workspace', 'Goal', 'idle', 1, 1)",
  );
  await db.execute(`INSERT INTO resolve_threads
    (id, session_id, pr_number, thread_id, origin_kind, state, state_reason, disposition, revision, created_at, updated_at)
    VALUES ('row', 'session', 1, 'thread', 'review_comment', 'answered', 'legacy_wontfix', 'no_change', 4, 1, 2)`);
  await db.execute('DELETE FROM resolve_queue_items');
  await db.execute(`INSERT INTO resolve_queue_items
    (id, session_id, thread_id, generation, reopened_from_item_id, candidate_revision, approval_state,
     approved_revision, approved_reply_hash, deferred_at, delivered_at, superseded_at, created_at, updated_at, integrated_sha)
    VALUES ('item-0', 'session', 'thread', 0, NULL, 3, 'accepted', 3, 'hash', NULL, 9, 8, 1, 2, 'sha-integrated'),
           ('item-1', 'session', 'thread', 1, 'item-0', 4, 'deferred', NULL, NULL, 7, NULL, NULL, 1, 2, NULL)`);
  return db;
};

describe('m151 resolve queue item refusal', () => {
  it('rejects a refusal before the rebuild and accepts one after it', async () => {
    const db = await seed();
    await expect(
      db.execute(`INSERT INTO resolve_queue_items
        (id, session_id, thread_id, generation, candidate_revision, approval_state, created_at, updated_at)
        VALUES ('item-2', 'session', 'other', 0, 4, 'wont_fix', 1, 2)`),
    ).rejects.toThrow(/CHECK constraint failed/);
    await migrate(db);
    await db.execute(`INSERT INTO resolve_queue_items
      (id, session_id, thread_id, generation, candidate_revision, approval_state, created_at, updated_at)
      VALUES ('item-2', 'session', 'other', 0, 4, 'wont_fix', 1, 2)`);
    expect(
      await db.select<Item>("SELECT approval_state FROM resolve_queue_items WHERE id = 'item-2'"),
    ).toEqual([{ approval_state: 'wont_fix' }]);
  });

  it('still rejects a state the union does not carry', async () => {
    const db = await seed();
    await migrate(db);
    await expect(
      db.execute(`INSERT INTO resolve_queue_items
        (id, session_id, thread_id, generation, candidate_revision, approval_state, created_at, updated_at)
        VALUES ('item-3', 'session', 'other', 0, 4, 'refused', 1, 2)`),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('preserves every row, its integrated commit and its self reference', async () => {
    const db = await seed();
    await migrate(db);
    expect(
      await db.select<Item>(
        `SELECT id, generation, reopened_from_item_id, approval_state, integrated_sha, candidate_revision, delivered_at
         FROM resolve_queue_items ORDER BY generation`,
      ),
    ).toEqual([
      {
        id: 'item-0',
        generation: 0,
        reopened_from_item_id: null,
        approval_state: 'accepted',
        integrated_sha: 'sha-integrated',
        candidate_revision: 3,
        delivered_at: 9,
      },
      {
        id: 'item-1',
        generation: 1,
        reopened_from_item_id: 'item-0',
        approval_state: 'deferred',
        integrated_sha: null,
        candidate_revision: 4,
        delivered_at: null,
      },
    ]);
  });

  it('leaves a legacy no change outcome undecided instead of calling it a refusal', async () => {
    const db = await seed();
    await migrate(db);
    expect(
      await db.select<Item>(
        "SELECT approval_state FROM resolve_queue_items WHERE approval_state = 'wont_fix'",
      ),
    ).toEqual([]);
  });

  it('keeps the generation uniqueness constraint and every index', async () => {
    const db = await seed();
    await migrate(db);
    await expect(
      db.execute(`INSERT INTO resolve_queue_items
        (id, session_id, thread_id, generation, candidate_revision, approval_state, created_at, updated_at)
        VALUES ('item-clash', 'session', 'thread', 1, 4, 'none', 1, 2)`),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    expect(
      await db.select<{ readonly name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'resolve_queue_items' AND name LIKE 'idx_%' ORDER BY name",
      ),
    ).toEqual([
      { name: 'idx_resolve_queue_items_live_thread' },
      { name: 'idx_resolve_queue_items_reopened_from' },
      { name: 'idx_resolve_queue_items_session' },
      { name: 'idx_resolve_queue_items_thread' },
    ]);
  });

  it('keeps the self reference and the session foreign key enforced after the rebuild', async () => {
    const db = await seed();
    await migrate(db);
    await expect(
      db.execute(`INSERT INTO resolve_queue_items
        (id, session_id, thread_id, generation, reopened_from_item_id, candidate_revision, approval_state, created_at, updated_at)
        VALUES ('item-orphan', 'session', 'orphan', 0, 'missing-item', 4, 'none', 1, 2)`),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(
      db.execute(`INSERT INTO resolve_queue_items
        (id, session_id, thread_id, generation, candidate_revision, approval_state, created_at, updated_at)
        VALUES ('item-nosession', 'missing-session', 'orphan', 0, 4, 'none', 1, 2)`),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(db.execute("DELETE FROM resolve_queue_items WHERE id = 'item-0'")).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('keeps the candidate membership foreign key pointed at the rebuilt table', async () => {
    const db = await seed();
    await migrate(db);
    await db.execute(`INSERT INTO resolve_candidates
      (id, session_id, revision, base_sha, candidate_sha, worktree_path, state, created_at, updated_at)
      VALUES ('candidate', 'session', 4, 'base', 'sha', '/tmp/work', 'ready', 1, 2)`);
    await expect(
      db.execute(
        "INSERT INTO resolve_candidate_items (candidate_id, queue_item_id, item_revision) VALUES ('candidate', 'missing-item', 4)",
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await db.execute(
      "INSERT INTO resolve_candidate_items (candidate_id, queue_item_id, item_revision) VALUES ('candidate', 'item-1', 4)",
    );
    expect(
      await db.select<{ readonly queue_item_id: string }>(
        'SELECT queue_item_id FROM resolve_candidate_items',
      ),
    ).toEqual([{ queue_item_id: 'item-1' }]);
  });
});
