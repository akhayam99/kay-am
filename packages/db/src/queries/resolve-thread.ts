import type { ResolveThread, ResolveThreadState, SessionId } from '@goodboy/types';
import type { Database } from '../client';
import { resolveStringArray } from './resolve-json';

type Row = Omit<ResolveThread, 'commitShas' | 'githubResolved'> & {
  readonly commitShas: string | null;
  readonly githubResolved: number | null;
};
type ListParams = { readonly db: Database; readonly sessionId: SessionId };
type UpsertParams = {
  readonly db: Database;
  readonly row: ResolveThread;
  readonly expectedRevision: number | null;
};
type StateParams = ListParams & {
  readonly threadId: string;
  readonly revision: number;
  readonly state: ResolveThreadState;
  readonly stateReason: string | null;
};

export const listResolveThreads = async ({
  db,
  sessionId,
}: ListParams): Promise<ReadonlyArray<ResolveThread>> => {
  const rows = await db.select<Row>(
    `SELECT id, session_id AS sessionId, project_id AS projectId, pr_number AS prNumber, thread_id AS threadId, origin_kind AS originKind, state, state_reason AS stateReason, revision, active_attempt_id AS activeAttemptId, disposition, reply_draft AS replyDraft, commit_shas_json AS commitShas, question, reply_posted_at AS replyPostedAt, reply_id AS replyId, github_resolved AS githubResolved, closed_at AS closedAt, closed_source AS closedSource, created_at AS createdAt, updated_at AS updatedAt FROM resolve_threads WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );
  return rows.map((row) => ({
    ...row,
    commitShas: row.commitShas === null ? null : resolveStringArray({ json: row.commitShas }),
    githubResolved: row.githubResolved === null ? null : row.githubResolved === 1,
  }));
};

export const upsertResolveThread = async ({
  db,
  row,
  expectedRevision,
}: UpsertParams): Promise<boolean> => {
  const result = await db.execute(
    `INSERT INTO resolve_threads (id, session_id, project_id, pr_number, thread_id, origin_kind, state, state_reason, revision, active_attempt_id, disposition, reply_draft, commit_shas_json, question, reply_posted_at, reply_id, github_resolved, closed_at, closed_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, thread_id) DO UPDATE SET
       project_id = excluded.project_id,
       pr_number = excluded.pr_number,
       origin_kind = excluded.origin_kind,
       state = excluded.state,
       state_reason = excluded.state_reason,
       active_attempt_id = excluded.active_attempt_id,
       disposition = excluded.disposition,
       reply_draft = excluded.reply_draft,
       commit_shas_json = excluded.commit_shas_json,
       question = excluded.question,
       reply_posted_at = excluded.reply_posted_at,
       reply_id = excluded.reply_id,
       github_resolved = excluded.github_resolved,
       closed_at = excluded.closed_at,
       closed_source = excluded.closed_source,
       updated_at = excluded.updated_at,
       revision = resolve_threads.revision + 1
     WHERE ? IS NULL OR resolve_threads.revision = ?`,
    [
      row.id,
      row.sessionId,
      row.projectId,
      row.prNumber,
      row.threadId,
      row.originKind,
      row.state,
      row.stateReason,
      row.revision,
      row.activeAttemptId,
      row.disposition,
      row.replyDraft,
      row.commitShas === null ? null : JSON.stringify(row.commitShas),
      row.question,
      row.replyPostedAt,
      row.replyId,
      row.githubResolved === null ? null : Number(row.githubResolved),
      row.closedAt,
      row.closedSource,
      row.createdAt,
      row.updatedAt,
      expectedRevision,
      expectedRevision,
    ],
  );
  return result.rowsAffected > 0;
};

export const setResolveThreadState = async ({
  db,
  sessionId,
  threadId,
  revision,
  state,
  stateReason,
}: StateParams): Promise<boolean> => {
  const result = await db.execute(
    `UPDATE resolve_threads SET state = ?, state_reason = ?, revision = revision + 1, updated_at = ?
     WHERE session_id = ? AND thread_id = ? AND revision = ?`,
    [state, stateReason, Date.now(), sessionId, threadId, revision],
  );
  return result.rowsAffected > 0;
};
