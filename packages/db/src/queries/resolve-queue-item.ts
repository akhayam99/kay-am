import type {
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import type { Database } from '../client';
import { resolveStringArray } from './resolve-json';

type ItemRow = ResolveQueueItem;
type JoinedRow = ItemRow & {
  readonly threadRowId: string;
  readonly projectId: ResolveThread['projectId'];
  readonly prNumber: number;
  readonly originKind: ResolveThread['originKind'];
  readonly state: ResolveThread['state'];
  readonly stateReason: string | null;
  readonly revision: number;
  readonly activeAttemptId: string | null;
  readonly disposition: ResolveThread['disposition'];
  readonly replyDraft: string | null;
  readonly commitShas: string | null;
  readonly question: string | null;
  readonly replyPostedAt: number | null;
  readonly replyId: string | null;
  readonly githubResolved: number | null;
  readonly closedAt: number | null;
  readonly closedSource: ResolveThread['closedSource'];
  readonly threadCreatedAt: number;
  readonly threadUpdatedAt: number;
};
type InsertParams = { readonly db: Database; readonly item: ResolveQueueItem };
type SessionParams = { readonly db: Database; readonly sessionId: SessionId };
type ApprovalParams = SessionParams & {
  readonly itemId: string;
  readonly revision: number;
  readonly replyHash: string;
};
type ItemParams = SessionParams & { readonly itemId: string };
type DeliveredParams = ItemParams & { readonly deliveredAt: number };
type ReopenParams = ItemParams & {
  readonly id: string;
  readonly candidateRevision: number;
};

const ITEM_COLUMNS = `id, session_id AS sessionId, thread_id AS threadId, generation,
  reopened_from_item_id AS reopenedFromItemId, candidate_revision AS candidateRevision,
  approval_state AS approvalState, approved_revision AS approvedRevision,
  approved_reply_hash AS approvedReplyHash, deferred_at AS deferredAt,
  delivered_at AS deliveredAt, superseded_at AS supersededAt,
  created_at AS createdAt, updated_at AS updatedAt`;

export const insertResolveQueueItem = async ({ db, item }: InsertParams): Promise<void> => {
  await db.execute(
    `INSERT INTO resolve_queue_items (id, session_id, thread_id, generation, reopened_from_item_id, candidate_revision, approval_state, approved_revision, approved_reply_hash, deferred_at, delivered_at, superseded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.sessionId,
      item.threadId,
      item.generation,
      item.reopenedFromItemId,
      item.candidateRevision,
      item.approvalState,
      item.approvedRevision,
      item.approvedReplyHash,
      item.deferredAt,
      item.deliveredAt,
      item.supersededAt,
      item.createdAt,
      item.updatedAt,
    ],
  );
};

export const listResolveQueueItems = async ({
  db,
  sessionId,
}: SessionParams): Promise<ReadonlyArray<ResolveQueueItemWithThread>> => {
  const rows = await db.select<JoinedRow>(
    `SELECT q.id, q.session_id AS sessionId, q.thread_id AS threadId, q.generation,
       q.reopened_from_item_id AS reopenedFromItemId, q.candidate_revision AS candidateRevision,
       q.approval_state AS approvalState, q.approved_revision AS approvedRevision,
       q.approved_reply_hash AS approvedReplyHash, q.deferred_at AS deferredAt,
       q.delivered_at AS deliveredAt, q.superseded_at AS supersededAt,
       q.created_at AS createdAt, q.updated_at AS updatedAt,
       r.id AS threadRowId, r.project_id AS projectId, r.pr_number AS prNumber,
       r.origin_kind AS originKind, r.state, r.state_reason AS stateReason,
       r.revision, r.active_attempt_id AS activeAttemptId, r.disposition,
       r.reply_draft AS replyDraft, r.commit_shas_json AS commitShas, r.question,
       r.reply_posted_at AS replyPostedAt, r.reply_id AS replyId,
       r.github_resolved AS githubResolved, r.closed_at AS closedAt,
       r.closed_source AS closedSource, r.created_at AS threadCreatedAt,
       r.updated_at AS threadUpdatedAt
     FROM resolve_queue_items q
     JOIN resolve_threads r ON r.session_id = q.session_id AND r.thread_id = q.thread_id
     WHERE q.session_id = ? AND q.superseded_at IS NULL
     ORDER BY q.created_at, q.id`,
    [sessionId],
  );
  return rows.map((row) => ({
    item: {
      id: row.id,
      sessionId: row.sessionId,
      threadId: row.threadId,
      generation: row.generation,
      reopenedFromItemId: row.reopenedFromItemId,
      candidateRevision: row.candidateRevision,
      approvalState: row.approvalState,
      approvedRevision: row.approvedRevision,
      approvedReplyHash: row.approvedReplyHash,
      deferredAt: row.deferredAt,
      deliveredAt: row.deliveredAt,
      supersededAt: row.supersededAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    thread: {
      id: row.threadRowId,
      sessionId: row.sessionId,
      projectId: row.projectId,
      prNumber: row.prNumber,
      threadId: row.threadId,
      originKind: row.originKind,
      state: row.state,
      stateReason: row.stateReason,
      revision: row.revision,
      activeAttemptId: row.activeAttemptId,
      disposition: row.disposition,
      replyDraft: row.replyDraft,
      commitShas: row.commitShas === null ? null : resolveStringArray({ json: row.commitShas }),
      question: row.question,
      replyPostedAt: row.replyPostedAt,
      replyId: row.replyId,
      githubResolved: row.githubResolved === null ? null : row.githubResolved === 1,
      closedAt: row.closedAt,
      closedSource: row.closedSource,
      createdAt: row.threadCreatedAt,
      updatedAt: row.threadUpdatedAt,
    },
  }));
};

export const setResolveQueueItemApproval = async ({
  db,
  sessionId,
  itemId,
  revision,
  replyHash,
}: ApprovalParams): Promise<boolean> => {
  const now = Date.now();
  const result = await db.execute(
    `UPDATE resolve_queue_items SET approval_state = 'accepted', approved_revision = ?, approved_reply_hash = ?, deferred_at = NULL, updated_at = ?
     WHERE id = ? AND session_id = ? AND superseded_at IS NULL AND candidate_revision = ?
       AND EXISTS (SELECT 1 FROM resolve_threads r WHERE r.session_id = resolve_queue_items.session_id AND r.thread_id = resolve_queue_items.thread_id AND r.revision = ?)`,
    [revision, replyHash, now, itemId, sessionId, revision, revision],
  );
  return result.rowsAffected === 1;
};

export const deferResolveQueueItem = async ({
  db,
  sessionId,
  itemId,
}: ItemParams): Promise<boolean> => {
  const now = Date.now();
  const result = await db.execute(
    `UPDATE resolve_queue_items SET approval_state = 'deferred', approved_revision = NULL, approved_reply_hash = NULL, deferred_at = ?, updated_at = ? WHERE id = ? AND session_id = ? AND superseded_at IS NULL AND delivered_at IS NULL`,
    [now, now, itemId, sessionId],
  );
  return result.rowsAffected === 1;
};

export const undeferResolveQueueItem = async ({
  db,
  sessionId,
  itemId,
}: ItemParams): Promise<boolean> => {
  const result = await db.execute(
    `UPDATE resolve_queue_items SET approval_state = 'none', deferred_at = NULL, updated_at = ? WHERE id = ? AND session_id = ? AND superseded_at IS NULL AND approval_state = 'deferred'`,
    [Date.now(), itemId, sessionId],
  );
  return result.rowsAffected === 1;
};

export const markResolveQueueItemDelivered = async ({
  db,
  sessionId,
  itemId,
  deliveredAt,
}: DeliveredParams): Promise<boolean> => {
  const result = await db.execute(
    `UPDATE resolve_queue_items SET delivered_at = ?, updated_at = ? WHERE id = ? AND session_id = ? AND superseded_at IS NULL AND approval_state = 'accepted' AND approved_revision = candidate_revision`,
    [deliveredAt, deliveredAt, itemId, sessionId],
  );
  return result.rowsAffected === 1;
};

export const reopenResolveQueueItem = async ({
  db,
  sessionId,
  itemId,
  id,
  candidateRevision,
}: ReopenParams): Promise<ResolveQueueItem | null> => {
  const current = (
    await db.select<ItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM resolve_queue_items WHERE id = ? AND session_id = ? AND superseded_at IS NULL
       AND EXISTS (SELECT 1 FROM resolve_threads r WHERE r.session_id = resolve_queue_items.session_id AND r.thread_id = resolve_queue_items.thread_id AND r.revision = ?)`,
      [itemId, sessionId, candidateRevision],
    )
  )[0];
  if (current === undefined) {
    return null;
  }
  const now = Date.now();
  await db.exec('BEGIN');
  try {
    const superseded = await db.execute(
      'UPDATE resolve_queue_items SET superseded_at = ?, updated_at = ? WHERE id = ? AND session_id = ? AND superseded_at IS NULL',
      [now, now, itemId, sessionId],
    );
    if (superseded.rowsAffected !== 1) {
      throw new Error('Resolve queue item changed before it could be reopened');
    }
    const item: ResolveQueueItem = {
      id,
      sessionId,
      threadId: current.threadId,
      generation: current.generation + 1,
      reopenedFromItemId: current.id,
      candidateRevision,
      approvalState: 'none',
      approvedRevision: null,
      approvedReplyHash: null,
      deferredAt: null,
      deliveredAt: null,
      supersededAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await insertResolveQueueItem({ db, item });
    await db.exec('COMMIT');
    return item;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};
