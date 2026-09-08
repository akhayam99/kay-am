import { describe, expect, it } from 'vitest';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from './index';
import { migrate } from './runner';

const NOW = Date.parse('2026-09-07T12:00:00.000Z');

const seedThrough144 = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(
    db,
    migrations.filter((migration) => migration.version <= 144),
  );
  await db.execute(
    `INSERT INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES ('workspace-1', 'Workspace', 'workspace', ?, ?)`,
    [NOW, NOW],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES ('session-1', 'workspace-1', 'Goal', 'idle', ?, ?)`,
    [NOW, NOW],
  );
  return db;
};

type EventParams = {
  readonly db: Database;
  readonly id: string;
  readonly kind: string;
};

const insertEvent = async ({ db, id, kind }: EventParams): Promise<void> => {
  await db.execute(
    'INSERT INTO session_events (id, session_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [
      id,
      'session-1',
      kind,
      '{"mountId":"mount-1","projectId":"project-1","provider":"github","host":"github.com","repository":"acme/web","number":12}',
      NOW,
    ],
  );
};

describe('m145 session event pr discovered', () => {
  it('accepts the pr_discovered kind next to the existing kinds', async () => {
    const db = await seedThrough144();

    await migrate(db, migrations);
    await insertEvent({ db, id: 'ev-1', kind: 'pr_discovered' });
    await insertEvent({ db, id: 'ev-2', kind: 'pr_created' });

    const rows = await db.select<{ kind: string }>(
      'SELECT kind FROM session_events ORDER BY id ASC',
    );
    expect(rows.map((row) => row.kind)).toEqual(['pr_discovered', 'pr_created']);
  });

  it('preserves rows written before the rebuild', async () => {
    const db = await seedThrough144();
    await insertEvent({ db, id: 'ev-old', kind: 'pr_merged' });

    await migrate(db, migrations);

    const rows = await db.select<{ id: string; kind: string }>(
      'SELECT id, kind FROM session_events',
    );
    expect(rows).toEqual([{ id: 'ev-old', kind: 'pr_merged' }]);
  });

  it('still refuses a kind nobody declared', async () => {
    const db = await seedThrough144();
    await migrate(db, migrations);

    await expect(insertEvent({ db, id: 'ev-bad', kind: 'pr_rediscovered' })).rejects.toThrow();
  });
});
