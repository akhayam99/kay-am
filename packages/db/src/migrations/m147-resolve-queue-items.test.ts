import { describe, expect, it } from 'vitest';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from './index';
import { migrate } from './runner';

describe('m147 resolve queue items', () => {
  it('backfills one live item for each nonclosed thread', async () => {
    const db = makeTestDatabase();
    await migrate(
      db,
      migrations.filter((migration) => migration.version < 147),
    );
    await db.execute(
      "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
    );
    await db.execute(
      "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session', 'workspace', 'Goal', 'idle', 1, 1)",
    );
    await db.execute(`INSERT INTO resolve_threads
      (id, session_id, pr_number, thread_id, origin_kind, state, revision, created_at, updated_at)
      VALUES ('open', 'session', 1, 'thread-open', 'review_comment', 'open', 3, 1, 2),
             ('closed', 'session', 1, 'thread-closed', 'review_comment', 'closed', 4, 1, 2)`);
    await migrate(db);
    expect(
      await db.select(
        'SELECT thread_id, candidate_revision, approval_state FROM resolve_queue_items',
      ),
    ).toEqual([{ thread_id: 'thread-open', candidate_revision: 3, approval_state: 'none' }]);
  });
});
