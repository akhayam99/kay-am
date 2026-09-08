import type { AgentId, IsoDateTime, SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';
export type NotificationKind =
  | 'session-created'
  | 'session-deleted'
  | 'summarizer-success'
  | 'summarizer-degraded'
  | 'agent-auto-spawn'
  | 'pr-created'
  | 'workspace-deleted'
  | 'workspace-merged'
  | 'project-adopted'
  | 'boundary-drift'
  | 'branch-changed'
  | 'budget-cap'
  | 'title-generation'
  | 'provider-connected'
  | 'orphan-worktrees'
  | 'error';

export type NotificationAction =
  | { readonly kind: 'retry-summarizer'; readonly sessionId: SessionId }
  | {
      readonly kind: 'retry-step-summary';
      readonly sessionId: SessionId;
      readonly agentId: AgentId;
    }
  | {
      readonly kind: 'open-agent';
      readonly sessionId: SessionId;
      readonly agentId: AgentId;
    }
  | { readonly kind: 'open-budget'; readonly sessionId: SessionId | null }
  | { readonly kind: 'open-orphan-worktrees'; readonly workspaceId: WorkspaceId }
  | { readonly kind: 'retry-publication'; readonly sessionId: SessionId };

export type Notification = {
  readonly id: string;
  readonly ts: IsoDateTime;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string | null;
  readonly severity: NotificationSeverity;
  readonly sessionId: SessionId | null;
  readonly workspaceId: WorkspaceId | null;
  readonly read: boolean;
  readonly action: NotificationAction | null;
  readonly coalesceKey: string | null;
};

type NotificationRow = {
  id: string;
  ts: number;
  kind: string;
  title: string;
  body: string | null;
  severity: string;
  session_id: string | null;
  workspace_id: string | null;
  read: number;
  action: string | null;
  coalesce_key: string | null;
};

function parseAction(raw: string | null): NotificationAction | null {
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(raw) as NotificationAction;
  } catch {
    return null;
  }
}

function serializeAction(action: NotificationAction | null): string | null {
  return action != null ? JSON.stringify(action) : null;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    ts: new Date(row.ts).toISOString() as IsoDateTime,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    severity: row.severity as NotificationSeverity,
    sessionId: row.session_id ? (row.session_id as SessionId) : null,
    workspaceId: row.workspace_id ? (row.workspace_id as WorkspaceId) : null,
    read: row.read !== 0,
    action: parseAction(row.action),
    coalesceKey: row.coalesce_key,
  };
}

export const insertNotification = async (db: Database, n: Notification): Promise<void> => {
  await db.execute(
    `INSERT INTO notifications (id, ts, kind, title, body, severity, session_id, workspace_id, read, action, coalesce_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      n.id,
      Date.parse(n.ts),
      n.kind,
      n.title,
      n.body ?? null,
      n.severity,
      n.sessionId ?? null,
      n.workspaceId ?? null,
      n.read ? 1 : 0,
      serializeAction(n.action),
      n.coalesceKey,
    ],
  );
};

export const NOTIFICATION_LIST_LIMIT = 200;

export const listNotifications = async (db: Database): Promise<ReadonlyArray<Notification>> => {
  const rows = await db.select<NotificationRow>(
    'SELECT * FROM notifications ORDER BY ts DESC LIMIT ?',
    [NOTIFICATION_LIST_LIMIT],
  );
  return rows.map(toNotification);
};

export type NotificationCounts = {
  readonly total: number;
  readonly unread: number;
};

export const countNotifications = async (db: Database): Promise<NotificationCounts> => {
  const rows = await db.select<{ total: number | null; unread: number | null }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END), 0) AS unread
     FROM notifications`,
  );
  const row = rows[0];
  return { total: row?.total ?? 0, unread: row?.unread ?? 0 };
};

export const markAllNotificationsRead = async (db: Database): Promise<void> => {
  await db.execute('UPDATE notifications SET read = 1 WHERE read = 0');
};

type SingleNotificationParams = {
  readonly db: Database;
  readonly id: string;
};

export const markNotificationRead = async ({ db, id }: SingleNotificationParams): Promise<void> => {
  await db.execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
};

export const deleteNotification = async ({ db, id }: SingleNotificationParams): Promise<void> => {
  await db.execute('DELETE FROM notifications WHERE id = ?', [id]);
};

export const clearAllNotifications = async (db: Database): Promise<void> => {
  await db.execute('DELETE FROM notifications');
};
