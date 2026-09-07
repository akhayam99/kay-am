import type { ResolveAttempt, ResolveAttemptPhase, SessionId } from '@goodboy/types';
import type { Database } from '../client';
import { resolveStringArray } from './resolve-json';

type ListParams = { readonly db: Database; readonly sessionId: SessionId };
type InsertParams = { readonly db: Database; readonly attempt: ResolveAttempt };
type PhaseParams = {
  readonly db: Database;
  readonly id: string;
  readonly phase: ResolveAttemptPhase;
  readonly error?: string | null;
};
type Row = Omit<ResolveAttempt, 'threadIds'> & { readonly threadIds: string };

export const listResolveAttempts = async ({
  db,
  sessionId,
}: ListParams): Promise<ReadonlyArray<ResolveAttempt>> => {
  const rows = await db.select<Row>(
    `SELECT id, session_id AS sessionId, agent_id AS agentId, pr_number AS prNumber, thread_ids_json AS threadIds, provider, model, effort, instructions, phase, started_at AS startedAt, ended_at AS endedAt, error, created_at AS createdAt FROM resolve_attempts WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );
  return rows.map((row) => ({ ...row, threadIds: resolveStringArray({ json: row.threadIds }) }));
};

export const insertResolveAttempt = async ({ db, attempt }: InsertParams): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_attempts (id, session_id, agent_id, pr_number, thread_ids_json, provider, model, effort, instructions, phase, started_at, ended_at, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET provider = excluded.provider, model = excluded.model,
      effort = excluded.effort, instructions = excluded.instructions, phase = excluded.phase,
      thread_ids_json = excluded.thread_ids_json,
      started_at = COALESCE(resolve_attempts.started_at, excluded.started_at)
    WHERE resolve_attempts.phase IN ('queued', 'running')`,
    [
      attempt.id,
      attempt.sessionId,
      attempt.agentId,
      attempt.prNumber,
      JSON.stringify(attempt.threadIds),
      attempt.provider,
      attempt.model,
      attempt.effort,
      attempt.instructions,
      attempt.phase,
      attempt.startedAt,
      attempt.endedAt,
      attempt.error,
      attempt.createdAt,
    ],
  );
};

export const setResolveAttemptPhase = async ({
  db,
  id,
  phase,
  error = null,
}: PhaseParams): Promise<void> => {
  const now = Date.now();
  const isTerminal = phase === 'finished' || phase === 'failed' || phase === 'cancelled';
  await db.execute(
    `UPDATE resolve_attempts SET phase = ?, error = ?, started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, ?) ELSE started_at END, ended_at = CASE WHEN ? THEN ? WHEN ? IN ('running', 'queued') THEN NULL ELSE ended_at END WHERE id = ?`,
    [phase, error, phase, now, Number(isTerminal), now, phase, id],
  );
};
