import type { ResolveThread, SessionId } from '@goodboy/types';
import type { Database } from '../client';

type CheckParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly version: number;
};
type CommitParams = CheckParams & { readonly rows: ReadonlyArray<ResolveThread> };

export const hasResolveImport = async ({
  db,
  sessionId,
  version,
}: CheckParams): Promise<boolean> => {
  const rows = await db.select<{ readonly version: number }>(
    'SELECT version FROM resolve_imports WHERE session_id = ? AND version = ?',
    [sessionId, version],
  );
  return rows.length > 0;
};

export const commitResolveImport = async ({
  db,
  sessionId,
  version,
  rows,
}: CommitParams): Promise<void> => {
  if (await hasResolveImport({ db, sessionId, version })) {
    return;
  }
  await db.execute(
    `INSERT INTO resolve_threads (id, session_id, project_id, pr_number, thread_id, origin_kind, state, state_reason, revision, active_attempt_id, disposition, reply_draft, commit_shas_json, question, reply_posted_at, reply_id, github_resolved, closed_at, closed_source, created_at, updated_at)
     SELECT json_extract(value, '$.id'), json_extract(value, '$.sessionId'), json_extract(value, '$.projectId'), json_extract(value, '$.prNumber'), json_extract(value, '$.threadId'), json_extract(value, '$.originKind'), json_extract(value, '$.state'), json_extract(value, '$.stateReason'), json_extract(value, '$.revision'), json_extract(value, '$.activeAttemptId'), json_extract(value, '$.disposition'), json_extract(value, '$.replyDraft'), json_extract(value, '$.commitShas'), json_extract(value, '$.question'), json_extract(value, '$.replyPostedAt'), json_extract(value, '$.replyId'), json_extract(value, '$.githubResolved'), json_extract(value, '$.closedAt'), json_extract(value, '$.closedSource'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt') FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM resolve_imports WHERE session_id = ? AND version = ?)
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
     WHERE resolve_threads.revision = 0`,
    [JSON.stringify(rows), sessionId, version],
  );
  await db.execute(
    'INSERT OR IGNORE INTO resolve_imports (session_id, version, completed_at) VALUES (?, ?, ?)',
    [sessionId, version, Date.now()],
  );
};
