import type {
  ResolvePublication,
  ResolvePublicationPhase,
  ResolvePublicationThread,
  SessionId,
} from '@goodboy/types';
import type { Database } from '../client';
import { resolveStringArray } from './resolve-json';

type PublicationRow = Omit<ResolvePublication, 'commitShas' | 'requiresPush'> & {
  readonly commitShas: string;
  readonly requiresPush: number;
};

const PUBLICATION_COLUMNS = `id, session_id AS sessionId, repo, pr_number AS prNumber, branch, local_head AS localHead, remote_head AS remoteHead, commit_shas_json AS commitShas, requires_push AS requiresPush, phase, pushed_head AS pushedHead, confirmed_at AS confirmedAt, completed_at AS completedAt, error, created_at AS createdAt`;

const THREAD_COLUMNS = `publication_id AS publicationId, thread_id AS threadId, revision, prior_state AS priorState, reply_body AS replyBody, reply_phase AS replyPhase, reply_id AS replyId, reply_posted_at AS replyPostedAt, resolve_phase AS resolvePhase, resolved_at AS resolvedAt, error`;

const ACTIVE_PHASES: ReadonlyArray<ResolvePublicationPhase> = [
  'confirmed',
  'pushing',
  'pushed',
  'posting',
];

const hydrate = (row: PublicationRow): ResolvePublication => ({
  ...row,
  commitShas: resolveStringArray({ json: row.commitShas }),
  requiresPush: row.requiresPush === 1,
});

export const insertResolvePublication = async ({
  db,
  publication,
}: {
  readonly db: Database;
  readonly publication: ResolvePublication;
}): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_publications (id, session_id, repo, pr_number, branch, local_head, remote_head, commit_shas_json, requires_push, phase, pushed_head, confirmed_at, completed_at, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      publication.id,
      publication.sessionId,
      publication.repo,
      publication.prNumber,
      publication.branch,
      publication.localHead,
      publication.remoteHead,
      JSON.stringify(publication.commitShas),
      Number(publication.requiresPush),
      publication.phase,
      publication.pushedHead,
      publication.confirmedAt,
      publication.completedAt,
      publication.error,
      publication.createdAt,
    ],
  );
};

export const setResolvePublicationPhase = async ({
  db,
  id,
  phase,
  error = null,
  pushedHead,
}: {
  readonly db: Database;
  readonly id: string;
  readonly phase: ResolvePublicationPhase;
  readonly error?: string | null;
  readonly pushedHead?: string | null;
}): Promise<void> => {
  const now = Date.now();
  const isTerminal = phase === 'finished' || phase === 'failed' || phase === 'cancelled';
  await db.execute(
    `UPDATE resolve_publications SET phase = ?, error = ?,
       pushed_head = CASE WHEN ? IS NULL THEN pushed_head ELSE ? END,
       confirmed_at = CASE WHEN ? = 'confirmed' THEN COALESCE(confirmed_at, ?) ELSE confirmed_at END,
       completed_at = CASE WHEN ? THEN ? ELSE completed_at END
     WHERE id = ?`,
    [phase, error, pushedHead ?? null, pushedHead ?? null, phase, now, Number(isTerminal), now, id],
  );
};

export const listActiveResolvePublications = async ({
  db,
  repo,
  prNumber,
}: {
  readonly db: Database;
  readonly repo: string;
  readonly prNumber: number;
}): Promise<ReadonlyArray<ResolvePublication>> => {
  const placeholders = ACTIVE_PHASES.map(() => '?').join(', ');
  const rows = await db.select<PublicationRow>(
    `SELECT ${PUBLICATION_COLUMNS} FROM resolve_publications WHERE repo = ? AND pr_number = ? AND phase IN (${placeholders}) ORDER BY created_at, id`,
    [repo, prNumber, ...ACTIVE_PHASES],
  );
  return rows.map(hydrate);
};

export const listResolvePublicationsForSession = async ({
  db,
  sessionId,
}: {
  readonly db: Database;
  readonly sessionId: SessionId;
}): Promise<ReadonlyArray<ResolvePublication>> => {
  const rows = await db.select<PublicationRow>(
    `SELECT ${PUBLICATION_COLUMNS} FROM resolve_publications WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );
  return rows.map(hydrate);
};

export const upsertResolvePublicationThread = async ({
  db,
  thread,
}: {
  readonly db: Database;
  readonly thread: ResolvePublicationThread;
}): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_publication_threads (publication_id, thread_id, revision, prior_state, reply_body, reply_phase, reply_id, reply_posted_at, resolve_phase, resolved_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (publication_id, thread_id) DO UPDATE SET
       revision = excluded.revision,
       prior_state = excluded.prior_state,
       reply_body = excluded.reply_body,
       reply_phase = excluded.reply_phase,
       reply_id = excluded.reply_id,
       reply_posted_at = excluded.reply_posted_at,
       resolve_phase = excluded.resolve_phase,
       resolved_at = excluded.resolved_at,
       error = excluded.error`,
    [
      thread.publicationId,
      thread.threadId,
      thread.revision,
      thread.priorState,
      thread.replyBody,
      thread.replyPhase,
      thread.replyId,
      thread.replyPostedAt,
      thread.resolvePhase,
      thread.resolvedAt,
      thread.error,
    ],
  );
};

export const listResolvePublicationThreads = async ({
  db,
  publicationId,
}: {
  readonly db: Database;
  readonly publicationId: string;
}): Promise<ReadonlyArray<ResolvePublicationThread>> => {
  return db.select<ResolvePublicationThread>(
    `SELECT ${THREAD_COLUMNS} FROM resolve_publication_threads WHERE publication_id = ? ORDER BY rowid`,
    [publicationId],
  );
};
