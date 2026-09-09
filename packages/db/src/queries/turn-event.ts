import type { AgentId, ProviderRunId, SessionId, TurnEvent } from '@goodboy/types';
import type { Database } from '../client';

type TurnEventRow = {
  id: string;
  session_id: string;
  agent_id: string;
  payload: string;
  created_at: number;
};

type CountUserTextEventsParams = {
  readonly db: Database;
  readonly agentId: AgentId;
};

type CountRow = {
  count: number;
};

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_TRUNCATED_STRING_LENGTH = 4096;
const TRUNCATION_MARKER = '…[truncated]';

type SerializeTurnEventParams = {
  readonly event: TurnEvent;
};

const payloadBytes = (payload: string): number => new TextEncoder().encode(payload).byteLength;

const markTruncated = (value: string): string =>
  `${value.slice(0, MAX_TRUNCATED_STRING_LENGTH)}${TRUNCATION_MARKER}`;

const toTruncatedEvent = ({ event }: SerializeTurnEventParams): TurnEvent => {
  switch (event.kind) {
    case 'user_text':
      return {
        kind: event.kind,
        runId: event.runId,
        text: markTruncated(event.text),
        ...(event.attachments !== undefined ? { attachments: [] } : {}),
        ...(event.provider !== undefined ? { provider: event.provider } : {}),
        ...(event.model !== undefined ? { model: markTruncated(event.model) } : {}),
        at: event.at,
      };
    case 'assistant_text':
      return { ...event, delta: markTruncated(event.delta) };
    case 'tool_call_start':
      return {
        kind: event.kind,
        runId: event.runId,
        toolUseId: markTruncated(event.toolUseId),
        toolName: markTruncated(event.toolName),
        input: TRUNCATION_MARKER,
        at: event.at,
      };
    case 'tool_call_end':
      return {
        kind: event.kind,
        runId: event.runId,
        toolUseId: markTruncated(event.toolUseId),
        output: TRUNCATION_MARKER,
        isError: event.isError,
        at: event.at,
      };
    case 'file_edit':
      return { ...event, path: markTruncated(event.path) };
    case 'usage':
      return {
        kind: event.kind,
        runId: event.runId,
        usage: event.usage,
        at: event.at,
      };
    case 'error':
    case 'decision_note':
      return { ...event, message: markTruncated(event.message) };
    case 'done':
      return event;
    case 'provider_session_init':
      return { ...event, providerSessionId: markTruncated(event.providerSessionId) };
    case 'skill_invocation':
      return {
        ...event,
        skillName: markTruncated(event.skillName),
        args: event.args.slice(0, 8).map(markTruncated),
      };
    case 'step_transition':
      return {
        ...event,
        fromStep: { ...event.fromStep, name: markTruncated(event.fromStep.name) },
        toStep: { ...event.toStep, name: markTruncated(event.toStep.name) },
        carryForwardContext: markTruncated(event.carryForwardContext),
      };
    case 'orchestrator_decision':
      return {
        ...event,
        reason: markTruncated(event.reason),
        ...(event.stepName !== undefined ? { stepName: markTruncated(event.stepName) } : {}),
        ...(event.operatorNote !== undefined
          ? { operatorNote: markTruncated(event.operatorNote) }
          : {}),
      };
    case 'permission_request':
      return {
        kind: event.kind,
        runId: event.runId,
        toolUseId: markTruncated(event.toolUseId),
        toolName: markTruncated(event.toolName),
        input: TRUNCATION_MARKER,
        at: event.at,
      };
    case 'permission_decision':
      return event;
    case 'unknown_payload':
      return { ...event, raw: TRUNCATION_MARKER };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
};

const serializeTurnEvent = ({ event }: SerializeTurnEventParams): string | null => {
  if (event.kind === 'unknown_payload') {
    return null;
  }
  const payload = JSON.stringify(event);
  if (payloadBytes(payload) <= MAX_PAYLOAD_BYTES) {
    return payload;
  }
  const truncatedPayload = JSON.stringify(toTruncatedEvent({ event }));
  if (payloadBytes(truncatedPayload) <= MAX_PAYLOAD_BYTES) {
    return truncatedPayload;
  }
  return JSON.stringify({
    kind: 'error',
    runId: event.runId,
    message: `${event.kind}${TRUNCATION_MARKER}`,
    retryable: false,
    at: event.at,
  } satisfies TurnEvent);
};

function rowToEvent(row: TurnEventRow): TurnEvent | null {
  try {
    return JSON.parse(row.payload) as TurnEvent;
  } catch {
    return null;
  }
}

function eventTimestamp(event: TurnEvent): number {
  if ('at' in event && typeof event.at === 'string') {
    const parsed = Date.parse(event.at);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

export const insertTurnEvent = async (
  db: Database,
  args: {
    readonly id: string;
    readonly sessionId: SessionId;
    readonly agentId: AgentId;
    readonly event: TurnEvent;
  },
): Promise<void> => {
  const payload = serializeTurnEvent({ event: args.event });
  if (payload === null) {
    return;
  }
  await db.execute(
    `INSERT INTO turn_events (id, session_id, agent_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [args.id, args.sessionId, args.agentId, payload, eventTimestamp(args.event)],
  );
};

export type PendingTurnEventInsert = {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly event: TurnEvent;
};

export const insertTurnEventsBatch = async (
  db: Database,
  inserts: ReadonlyArray<PendingTurnEventInsert>,
): Promise<void> => {
  if (inserts.length === 0) {
    return;
  }
  if (inserts.length === 1) {
    const ins = inserts[0]!;
    await insertTurnEvent(db, ins);
    return;
  }
  const persisted = inserts.flatMap((insert) => {
    const payload = serializeTurnEvent({ event: insert.event });
    return payload === null ? [] : [{ insert, payload }];
  });
  if (persisted.length === 0) {
    return;
  }
  const placeholders = persisted.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const values: unknown[] = [];
  for (const { insert, payload } of persisted) {
    values.push(insert.id, insert.sessionId, insert.agentId, payload, eventTimestamp(insert.event));
  }
  await db.execute(
    `INSERT INTO turn_events (id, session_id, agent_id, payload, created_at) VALUES ${placeholders}`,
    values,
  );
};

export const listTurnEventsForAgent = async (
  db: Database,
  agentId: AgentId,
  opts?: { readonly limit?: number },
): Promise<ReadonlyArray<TurnEvent>> => {
  if (opts?.limit !== undefined) {
    const rows = await db.select<TurnEventRow>(
      'SELECT * FROM turn_events WHERE agent_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
      [agentId, opts.limit],
    );
    const events = rows.map(rowToEvent).filter((e): e is TurnEvent => e !== null);
    events.reverse();
    return events;
  }
  const rows = await db.select<TurnEventRow>(
    'SELECT * FROM turn_events WHERE agent_id = ? ORDER BY created_at ASC, rowid ASC',
    [agentId],
  );
  return rows.map(rowToEvent).filter((e): e is TurnEvent => e !== null);
};

export const listTurnEventsForSession = async (
  db: Database,
  sessionId: SessionId,
): Promise<ReadonlyArray<TurnEvent>> => {
  const rows = await db.select<TurnEventRow>(
    'SELECT * FROM turn_events WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
    [sessionId],
  );
  return rows.map(rowToEvent).filter((e): e is TurnEvent => e !== null);
};

export const countUserTextEvents = async ({
  db,
  agentId,
}: CountUserTextEventsParams): Promise<number> => {
  const rows = await db.select<CountRow>(
    `SELECT COUNT(*) AS count
     FROM turn_events
     WHERE agent_id = ? AND json_extract(payload, '$.kind') = 'user_text'`,
    [agentId],
  );
  return rows[0]?.count ?? 0;
};

type SessionScopedTurnEventParams = {
  readonly db: Database;
  readonly sessionIds: ReadonlyArray<SessionId>;
};

export type TurnEventStorageStats = {
  readonly rowCount: number;
  readonly payloadBytes: number;
};

type StatsRow = {
  row_count: number;
  payload_bytes: number | null;
};

export const getTurnEventStatsForSessions = async ({
  db,
  sessionIds,
}: SessionScopedTurnEventParams): Promise<TurnEventStorageStats> => {
  if (sessionIds.length === 0) {
    return { rowCount: 0, payloadBytes: 0 };
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  const rows = await db.select<StatsRow>(
    `SELECT COUNT(*) AS row_count, SUM(LENGTH(payload)) AS payload_bytes
     FROM turn_events
     WHERE session_id IN (${placeholders})`,
    sessionIds,
  );
  const row = rows[0];
  return {
    rowCount: row?.row_count ?? 0,
    payloadBytes: row?.payload_bytes ?? 0,
  };
};

export const deleteTurnEventsForSessions = async ({
  db,
  sessionIds,
}: SessionScopedTurnEventParams): Promise<number> => {
  if (sessionIds.length === 0) {
    return 0;
  }
  const placeholders = sessionIds.map(() => '?').join(', ');
  const result = await db.execute(
    `DELETE FROM turn_events WHERE session_id IN (${placeholders})`,
    sessionIds,
  );
  return result.rowsAffected;
};

export const listAgentRunIdsForSession = async (
  db: Database,
  sessionId: SessionId,
): Promise<Map<AgentId, ReadonlyArray<ProviderRunId>>> => {
  const rows = await db.select<TurnEventRow>(
    'SELECT * FROM turn_events WHERE session_id = ? ORDER BY created_at ASC, rowid ASC',
    [sessionId],
  );
  const result = new Map<AgentId, ProviderRunId[]>();
  const seen = new Map<AgentId, Set<string>>();
  for (const row of rows) {
    const event = rowToEvent(row);
    if (!event) {
      continue;
    }
    const runId = event.runId;
    if (!runId || runId === ('history' as ProviderRunId)) {
      continue;
    }
    const agentId = row.agent_id as AgentId;
    let bucket = seen.get(agentId);
    if (!bucket) {
      bucket = new Set();
      seen.set(agentId, bucket);
      result.set(agentId, []);
    }
    if (bucket.has(runId)) {
      continue;
    }
    bucket.add(runId);
    result.get(agentId)!.push(runId);
  }
  return result;
};
