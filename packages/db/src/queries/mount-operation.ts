import type { IsoDateTime, MountOperation, SessionId } from '@goodboy/types';
import type { Database } from '../client';

type Row = Omit<MountOperation, 'input' | 'result' | 'createdAt' | 'updatedAt'> & {
  readonly input: string;
  readonly result: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
};

type UpsertMountOperationParams = {
  readonly db: Database;
  readonly operation: MountOperation;
};

type GetMountOperationParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly requestId: string;
};

type ListMountOperationsParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
};

const parseJson = ({ value }: { readonly value: string }): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const toDomain = (row: Row): MountOperation => ({
  ...row,
  input: parseJson({ value: row.input }),
  result: row.result === null ? null : parseJson({ value: row.result }),
  createdAt: new Date(row.createdAt).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updatedAt).toISOString() as IsoDateTime,
});

export const upsertMountOperation = async ({
  db,
  operation,
}: UpsertMountOperationParams): Promise<void> => {
  await db.execute(
    `INSERT INTO mount_operations
      (id, session_id, mount_id, request_id, kind, status, expected_revision, input_json,
       result_json, error_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, request_id) DO UPDATE SET
       mount_id = excluded.mount_id,
       kind = excluded.kind,
       status = excluded.status,
       expected_revision = excluded.expected_revision,
       input_json = excluded.input_json,
       result_json = excluded.result_json,
       error_code = excluded.error_code,
       updated_at = excluded.updated_at`,
    [
      operation.id,
      operation.sessionId,
      operation.mountId,
      operation.requestId,
      operation.kind,
      operation.status,
      operation.expectedRevision,
      JSON.stringify(operation.input) ?? 'null',
      operation.result === null ? null : (JSON.stringify(operation.result) ?? 'null'),
      operation.errorCode,
      Date.parse(operation.createdAt),
      Date.parse(operation.updatedAt),
    ],
  );
};

export const getMountOperation = async ({
  db,
  sessionId,
  requestId,
}: GetMountOperationParams): Promise<MountOperation | null> => {
  const rows = await db.select<Row>(
    `SELECT id, session_id AS sessionId, mount_id AS mountId, request_id AS requestId,
            kind, status, expected_revision AS expectedRevision, input_json AS input,
            result_json AS result, error_code AS errorCode,
            created_at AS createdAt, updated_at AS updatedAt
     FROM mount_operations WHERE session_id = ? AND request_id = ? LIMIT 1`,
    [sessionId, requestId],
  );
  const row = rows[0];
  return row === undefined ? null : toDomain(row);
};

export const listMountOperations = async ({
  db,
  sessionId,
}: ListMountOperationsParams): Promise<ReadonlyArray<MountOperation>> => {
  const rows = await db.select<Row>(
    `SELECT id, session_id AS sessionId, mount_id AS mountId, request_id AS requestId,
            kind, status, expected_revision AS expectedRevision, input_json AS input,
            result_json AS result, error_code AS errorCode,
            created_at AS createdAt, updated_at AS updatedAt
     FROM mount_operations WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );
  return rows.map(toDomain);
};

export const listUnsettledMountOperations = async ({
  db,
}: {
  readonly db: Database;
}): Promise<ReadonlyArray<MountOperation>> => {
  const rows = await db.select<Row>(
    `SELECT id, session_id AS sessionId, mount_id AS mountId, request_id AS requestId,
            kind, status, expected_revision AS expectedRevision, input_json AS input,
            result_json AS result, error_code AS errorCode,
            created_at AS createdAt, updated_at AS updatedAt
     FROM mount_operations
     WHERE status IN ('pending', 'running', 'uncertain')
     ORDER BY created_at, id`,
    [],
  );
  return rows.map(toDomain);
};
