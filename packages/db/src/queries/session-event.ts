import type {
  IsoDateTime,
  MaterializationDeferralCause,
  SessionEvent,
  SessionEventId,
  SessionEventKind,
  SessionEventPayload,
  SessionId,
} from '@goodboy/types';
import { MATERIALIZATION_DEFERRAL_CAUSES } from '@goodboy/types';
import type { Database } from '../client';

type SessionEventRow = {
  readonly id: string;
  readonly session_id: string;
  readonly kind: string;
  readonly payload_json: string | null;
  readonly created_at: number;
};

type FieldParams = {
  readonly source: Readonly<Record<string, unknown>>;
  readonly key: string;
};

const stringAt = ({ source, key }: FieldParams): string | null => {
  const value = source[key];
  return typeof value === 'string' ? value : null;
};

const numberAt = ({ source, key }: FieldParams): number | null => {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const booleanAt = ({ source, key }: FieldParams): boolean | null => {
  const value = source[key];
  return typeof value === 'boolean' ? value : null;
};

const deferralCauseAt = ({ source, key }: FieldParams): MaterializationDeferralCause | null => {
  const value = stringAt({ source, key });
  return MATERIALIZATION_DEFERRAL_CAUSES.find((candidate) => candidate === value) ?? null;
};

type DecodePayloadParams = {
  readonly raw: string;
};

const decodePayload = ({ raw }: DecodePayloadParams): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

type ParsePayloadParams = {
  readonly raw: string | null;
};

const parsePayload = ({ raw }: ParsePayloadParams): SessionEventPayload | null => {
  if (raw == null || raw.length === 0) {
    return null;
  }
  const decoded = decodePayload({ raw });
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return null;
  }
  const source = decoded as Readonly<Record<string, unknown>>;
  const worktreePath = stringAt({ source, key: 'worktreePath' });
  const branch = stringAt({ source, key: 'branch' });
  const from = stringAt({ source, key: 'from' });
  const to = stringAt({ source, key: 'to' });
  const provider = stringAt({ source, key: 'provider' });
  const identifier = stringAt({ source, key: 'identifier' });
  const title = stringAt({ source, key: 'title' });
  const url = stringAt({ source, key: 'url' });
  const workflowName = stringAt({ source, key: 'workflowName' });
  const runId = stringAt({ source, key: 'runId' });
  const projectId = stringAt({ source, key: 'projectId' });
  const mountId = stringAt({ source, key: 'mountId' });
  const host = stringAt({ source, key: 'host' });
  const repository = stringAt({ source, key: 'repository' });
  const projectName = stringAt({ source, key: 'projectName' });
  const reason = stringAt({ source, key: 'reason' });
  const agentId = stringAt({ source, key: 'agentId' });
  const kept = booleanAt({ source, key: 'kept' });
  const externalId = stringAt({ source, key: 'externalId' });
  const number = numberAt({ source, key: 'number' });
  const added = numberAt({ source, key: 'added' });
  const removed = numberAt({ source, key: 'removed' });
  const behind = numberAt({ source, key: 'behind' });
  const turnRunId = stringAt({ source, key: 'turnRunId' });
  const deferralCause = deferralCauseAt({ source, key: 'deferralCause' });
  return {
    ...(worktreePath != null ? { worktreePath } : {}),
    ...(branch != null ? { branch } : {}),
    ...(from != null ? { from } : {}),
    ...(to != null ? { to } : {}),
    ...(provider != null ? { provider } : {}),
    ...(identifier != null ? { identifier } : {}),
    ...(title != null ? { title } : {}),
    ...(url != null ? { url } : {}),
    ...(workflowName != null ? { workflowName } : {}),
    ...(runId != null ? { runId } : {}),
    ...(projectId != null ? { projectId } : {}),
    ...(mountId != null ? { mountId } : {}),
    ...(host != null ? { host } : {}),
    ...(repository != null ? { repository } : {}),
    ...(projectName != null ? { projectName } : {}),
    ...(reason != null ? { reason } : {}),
    ...(agentId != null ? { agentId } : {}),
    ...(kept != null ? { kept } : {}),
    ...(externalId != null ? { externalId } : {}),
    ...(number != null ? { number } : {}),
    ...(added != null ? { added } : {}),
    ...(removed != null ? { removed } : {}),
    ...(behind != null ? { behind } : {}),
    ...(turnRunId != null ? { turnRunId } : {}),
    ...(deferralCause != null ? { deferralCause } : {}),
  };
};

type ToDomainParams = {
  readonly row: SessionEventRow;
};

const toDomain = ({ row }: ToDomainParams): SessionEvent => ({
  id: row.id as SessionEventId,
  sessionId: row.session_id as SessionId,
  kind: row.kind as SessionEventKind,
  payload: parsePayload({ raw: row.payload_json }),
  createdAt: new Date(row.created_at).toISOString() as IsoDateTime,
});

type InsertParams = {
  readonly db: Database;
  readonly event: SessionEvent;
};

export const insertSessionEvent = async ({ db, event }: InsertParams): Promise<void> => {
  await db.execute(
    `INSERT INTO session_events (id, session_id, kind, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      event.id,
      event.sessionId,
      event.kind,
      event.payload == null ? null : JSON.stringify(event.payload),
      Date.parse(event.createdAt),
    ],
  );
};

type ListParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
};

export const listSessionEvents = async ({
  db,
  sessionId,
}: ListParams): Promise<ReadonlyArray<SessionEvent>> => {
  const rows = await db.select<SessionEventRow>(
    `SELECT id, session_id, kind, payload_json, created_at
       FROM session_events
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  return rows.map((row) => toDomain({ row }));
};

type DeleteParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
};

export const deleteSessionEvents = async ({ db, sessionId }: DeleteParams): Promise<void> => {
  await db.execute('DELETE FROM session_events WHERE session_id = ?', [sessionId]);
};
