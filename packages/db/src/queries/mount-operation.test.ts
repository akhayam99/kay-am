import { describe, expect, it } from 'vitest';
import type { IsoDateTime, MountId, MountOperation, SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import {
  getMountOperation,
  listMountOperations,
  listUnsettledMountOperations,
  upsertMountOperation,
} from './mount-operation';

const workspaceId = 'workspace' as WorkspaceId;
const sessionId = 'session' as SessionId;
const mountId = 'mount' as MountId;
const now = new Date('2026-09-08T10:00:00.000Z').toISOString() as IsoDateTime;

type OperationParams = {
  readonly status: MountOperation['status'];
};

const seed = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  const timestamp = Date.parse(now);
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'Workspace', 'workspace', timestamp, timestamp],
  );
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, 'Goal', 'idle', ?, ?)`,
    [sessionId, workspaceId, timestamp, timestamp],
  );
  return db;
};

const operation = ({ status }: OperationParams): MountOperation => ({
  id: 'operation',
  sessionId,
  mountId: null,
  requestId: 'request',
  kind: 'fork',
  status,
  expectedRevision: 0,
  input: { branch: 'feature' },
  result: status === 'succeeded' ? { mountId } : null,
  errorCode: null,
  createdAt: now,
  updatedAt: now,
});

describe('mount operations', () => {
  it('updates a retried request instead of duplicating it', async () => {
    const db = await seed();
    await upsertMountOperation({ db, operation: operation({ status: 'pending' }) });
    await upsertMountOperation({ db, operation: operation({ status: 'succeeded' }) });

    const stored = await getMountOperation({ db, sessionId, requestId: 'request' });

    expect(stored).toMatchObject({ status: 'succeeded', result: { mountId } });
    expect(await listMountOperations({ db, sessionId })).toHaveLength(1);
  });

  it('stops reporting an in-flight request once its session is deleted', async () => {
    const db = await seed();
    await upsertMountOperation({ db, operation: operation({ status: 'pending' }) });

    expect(await listUnsettledMountOperations({ db })).toHaveLength(1);

    await db.execute('UPDATE sessions SET deleted_at = ? WHERE id = ?', [Date.now(), sessionId]);

    expect(await listUnsettledMountOperations({ db })).toEqual([]);
    expect(await listMountOperations({ db, sessionId })).toHaveLength(1);
  });
});
