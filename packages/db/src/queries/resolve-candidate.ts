import type {
  ResolveCandidate,
  ResolveCandidateItem,
  ResolveCandidateState,
  SessionId,
} from '@goodboy/types';
import type { Database } from '../client';

type CandidateParams = { readonly db: Database; readonly candidate: ResolveCandidate };
type CandidateIdParams = { readonly db: Database; readonly candidateId: string };
type QueueItemParams = { readonly db: Database; readonly queueItemId: string };
type ItemParams = { readonly db: Database; readonly item: ResolveCandidateItem };
type SessionParams = { readonly db: Database; readonly sessionId: SessionId };
type ReadyParams = CandidateIdParams & { readonly candidateSha: string };
type StateParams = CandidateIdParams & { readonly state: ResolveCandidateState };
type IntegratedParams = CandidateIdParams & { readonly integratedSha: string };
type Approval = {
  readonly queueItemId: string;
  readonly revision: number;
  readonly replyHash: string;
};
type FinalizeParams = IntegratedParams & { readonly approvals: ReadonlyArray<Approval> };

const COLUMNS = `id, session_id AS sessionId, revision, base_sha AS baseSha,
  candidate_sha AS candidateSha, worktree_path AS worktreePath, state,
  integrated_sha AS integratedSha, created_at AS createdAt, updated_at AS updatedAt`;

export const insertResolveCandidate = async ({ db, candidate }: CandidateParams): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_candidates (id, session_id, revision, base_sha, candidate_sha, worktree_path, state, integrated_sha, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      candidate.id,
      candidate.sessionId,
      candidate.revision,
      candidate.baseSha,
      candidate.candidateSha,
      candidate.worktreePath,
      candidate.state,
      candidate.integratedSha,
      candidate.createdAt,
      candidate.updatedAt,
    ],
  );
};

export const insertResolveCandidateItem = async ({ db, item }: ItemParams): Promise<void> => {
  await db.execute(
    'INSERT OR REPLACE INTO resolve_candidate_items (candidate_id, queue_item_id, item_revision) VALUES (?, ?, ?)',
    [item.candidateId, item.queueItemId, item.itemRevision],
  );
};

export const getResolveCandidate = async ({
  db,
  candidateId,
}: CandidateIdParams): Promise<ResolveCandidate | null> => {
  const rows = await db.select<ResolveCandidate>(
    `SELECT ${COLUMNS} FROM resolve_candidates WHERE id = ?`,
    [candidateId],
  );
  return rows[0] ?? null;
};

export const getReadyResolveCandidateForItem = async ({
  db,
  queueItemId,
}: QueueItemParams): Promise<ResolveCandidate | null> => {
  const rows = await db.select<ResolveCandidate>(
    `SELECT ${COLUMNS} FROM resolve_candidates
     WHERE state = 'ready'
       AND EXISTS (SELECT 1 FROM resolve_candidate_items i WHERE i.candidate_id = resolve_candidates.id AND i.queue_item_id = ?)
     ORDER BY created_at DESC, id DESC`,
    [queueItemId],
  );
  return rows[0] ?? null;
};

export const listResolveCandidateItems = async ({
  db,
  candidateId,
}: CandidateIdParams): Promise<ReadonlyArray<ResolveCandidateItem>> =>
  db.select<ResolveCandidateItem>(
    `SELECT candidate_id AS candidateId, queue_item_id AS queueItemId, item_revision AS itemRevision
     FROM resolve_candidate_items WHERE candidate_id = ? ORDER BY queue_item_id`,
    [candidateId],
  );

export const listResolveCandidates = async ({
  db,
  sessionId,
}: SessionParams): Promise<ReadonlyArray<ResolveCandidate>> =>
  db.select<ResolveCandidate>(
    `SELECT ${COLUMNS} FROM resolve_candidates WHERE session_id = ? ORDER BY created_at, id`,
    [sessionId],
  );

export const markResolveCandidateReady = async ({
  db,
  candidateId,
  candidateSha,
}: ReadyParams): Promise<boolean> => {
  const result = await db.execute(
    "UPDATE resolve_candidates SET state = 'ready', candidate_sha = ?, updated_at = ? WHERE id = ? AND state = 'building'",
    [candidateSha, Date.now(), candidateId],
  );
  return result.rowsAffected === 1;
};

export const setResolveCandidateState = async ({
  db,
  candidateId,
  state,
}: StateParams): Promise<boolean> => {
  const result = await db.execute(
    "UPDATE resolve_candidates SET state = ?, updated_at = ? WHERE id = ? AND state != 'integrated'",
    [state, Date.now(), candidateId],
  );
  return result.rowsAffected === 1;
};

export const markOverlappingResolveCandidatesStale = async ({
  db,
  candidateId,
}: CandidateIdParams): Promise<void> => {
  await db.execute(
    `UPDATE resolve_candidates SET state = 'stale', updated_at = ?
     WHERE id != ? AND state IN ('building', 'ready')
       AND EXISTS (
         SELECT 1 FROM resolve_candidate_items mine
         JOIN resolve_candidate_items theirs ON theirs.queue_item_id = mine.queue_item_id
         WHERE mine.candidate_id = ? AND theirs.candidate_id = resolve_candidates.id
       )`,
    [Date.now(), candidateId, candidateId],
  );
};

export const markResolveCandidateIntegrated = async ({
  db,
  candidateId,
  integratedSha,
}: IntegratedParams): Promise<boolean> => {
  const result = await db.execute(
    "UPDATE resolve_candidates SET state = 'integrated', integrated_sha = ?, updated_at = ? WHERE id = ? AND state = 'ready'",
    [integratedSha, Date.now(), candidateId],
  );
  return result.rowsAffected === 1;
};

export const finalizeResolveCandidateIntegration = async ({
  db,
  candidateId,
  integratedSha,
  approvals,
}: FinalizeParams): Promise<void> => {
  const now = Date.now();
  await db.exec('BEGIN');
  try {
    for (const approval of approvals) {
      const result = await db.execute(
        `UPDATE resolve_queue_items SET approval_state = 'accepted', approved_revision = ?, approved_reply_hash = ?, integrated_sha = ?, deferred_at = NULL, updated_at = ?
         WHERE id = ? AND superseded_at IS NULL AND candidate_revision = ?
           AND EXISTS (SELECT 1 FROM resolve_threads r WHERE r.session_id = resolve_queue_items.session_id AND r.thread_id = resolve_queue_items.thread_id AND r.revision = ?)`,
        [
          approval.revision,
          approval.replyHash,
          integratedSha,
          now,
          approval.queueItemId,
          approval.revision,
          approval.revision,
        ],
      );
      if (result.rowsAffected !== 1) {
        throw new Error('Candidate covers an item whose revision is stale');
      }
    }
    const marked = await markResolveCandidateIntegrated({ db, candidateId, integratedSha });
    if (!marked) {
      throw new Error('Candidate is no longer ready');
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};
