import type { SessionId, WorkspaceId } from '@goodboy/types';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../client';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import {
  listArchivedSessionsForWorkspace,
  listSessionsForWorkspace,
  purgeSessionForDelete,
} from './session';

const workspaceId = 'workspace-1' as WorkspaceId;
const sessionId = 'session-1' as SessionId;
const otherSessionId = 'session-2' as SessionId;

const countRows = async ({
  db,
  table,
  column,
  value,
}: {
  readonly db: Database;
  readonly table: string;
  readonly column: string;
  readonly value: string;
}): Promise<number> => {
  const rows = await db.select<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`,
    [value],
  );
  return rows[0]?.count ?? 0;
};

describe('purgeSessionForDelete', () => {
  let db: Database;

  beforeEach(async () => {
    db = makeTestDatabase();
    await migrate(db);
    await db.execute(
      'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
      [workspaceId, 'Workspace', '/tmp/workspace'],
    );
    await db.execute(
      `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
       VALUES (?, ?, 'Delete me', 'idle', 1, 1), (?, ?, 'Keep me', 'idle', 2, 2)`,
      [sessionId, workspaceId, otherSessionId, workspaceId],
    );
    await db.execute(
      `INSERT INTO agents (id, session_id, ordinal, name, status)
       VALUES ('agent-1', ?, 0, 'Agent', 'completed'),
              ('agent-2', ?, 0, 'Other agent', 'completed')`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO messages (id, session_id, agent_id, role, content, created_at)
       VALUES ('message-1', ?, 'agent-1', 'user', 'hello', 1),
              ('message-2', ?, 'agent-2', 'user', 'hello', 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO turn_events (id, session_id, agent_id, payload, created_at)
       VALUES ('event-1', ?, 'agent-1', '{}', 1),
              ('event-2', ?, 'agent-2', '{}', 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO file_versions
         (id, session_id, relative_path, stored_name, size_bytes, content_hash, change_kind, snapshot_source, captured_at)
       VALUES ('file-1', ?, 'a', 'a', 1, 'a', 'modified', 'agent_turn', 1),
              ('file-2', ?, 'b', 'b', 1, 'b', 'modified', 'agent_turn', 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO context_slots (session_id, key, value)
       VALUES (?, 'key', 'value'), (?, 'key', 'value')`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO context_slot_history (id, session_id, key, value, author, created_at)
       VALUES ('history-1', ?, 'key', 'value', 'user', 1),
              ('history-2', ?, 'key', 'value', 'user', 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO workflows (id, workspace_id, name, created_at, updated_at)
       VALUES ('workflow-1', ?, 'Workflow', 1, 1)`,
      [workspaceId],
    );
    await db.execute(
      `INSERT INTO session_workflows
         (workflow_run_id, session_id, workflow_id, ordinal, created_at)
       VALUES ('run-1', ?, 'workflow-1', 0, 1),
              ('run-2', ?, 'workflow-1', 0, 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO goal_attachments
         (id, session_id, workflow_run_id, rel_path, kind, file_name, mime_type, created_at)
       VALUES ('attachment-session', ?, NULL, 'a', 'file', 'a', 'text/plain', 1),
              ('attachment-run', NULL, 'run-1', 'b', 'file', 'b', 'text/plain', 1),
              ('attachment-other', ?, NULL, 'c', 'file', 'c', 'text/plain', 2)`,
      [sessionId, otherSessionId],
    );
    await db.execute(
      `INSERT INTO provider_runs (id, session_id, provider, model, status_kind, created_at)
       VALUES ('provider-run-1', ?, 'anthropic', 'model', 'succeeded', 1)`,
      [sessionId],
    );
    await db.execute(
      `INSERT INTO telemetry_records
         (id, run_id, session_id, kind, provider, model, input_tokens, output_tokens, estimated_cost_usd, recorded_at)
       VALUES ('telemetry-1', 'provider-run-1', ?, 'turn', 'anthropic', 'model', 1, 1, 1, 1)`,
      [sessionId],
    );
    await db.execute(
      `INSERT INTO session_worktrees (id, session_id, worktree_path, branch, created_at)
       VALUES ('worktree-1', ?, '/tmp/worktree-1', 'branch', 1)`,
      [sessionId],
    );
    await db.execute(
      `INSERT INTO mount_pr_links
         (id, mount_id, provider, host, repo_slug, pr_number, head_branch, base_branch, url,
          state, snapshot_json, last_observed_at, created_at, updated_at)
       VALUES ('link-1', 'worktree-1', 'github', 'github.com', 'acme/app', 7, 'branch', 'main',
               'https://github.com/acme/app/pull/7', 'merged', '{}', 1, 1, 1)`,
    );
    await db.execute(
      `INSERT INTO mount_operations
         (id, session_id, mount_id, request_id, kind, status, expected_revision, input_json,
          created_at, updated_at)
       VALUES ('operation-1', ?, 'worktree-1', 'req-1', 'unmount', 'succeeded', 0, '{}', 1, 1)`,
      [sessionId],
    );
    await db.execute(
      `INSERT INTO diff_comments (id, session_id, file_path, body, status, created_at)
       VALUES ('comment-1', ?, 'file', 'body', 'open', 1)`,
      [sessionId],
    );
  });

  it('purges heavy rows, preserves metrics and links, and hides the session', async () => {
    await purgeSessionForDelete({ db, id: sessionId });

    const sessions = await db.select<{ deleted_at: number | null; updated_at: number }>(
      'SELECT deleted_at, updated_at FROM sessions WHERE id = ?',
      [sessionId],
    );
    expect(sessions[0]?.deleted_at).toEqual(expect.any(Number));
    expect(sessions[0]?.updated_at).toBe(sessions[0]?.deleted_at);

    for (const table of ['messages', 'file_versions', 'context_slots', 'context_slot_history']) {
      await expect(countRows({ db, table, column: 'session_id', value: sessionId })).resolves.toBe(
        0,
      );
      await expect(
        countRows({ db, table, column: 'session_id', value: otherSessionId }),
      ).resolves.toBe(1);
    }
    await expect(
      countRows({ db, table: 'turn_events', column: 'agent_id', value: 'agent-1' }),
    ).resolves.toBe(0);
    await expect(
      countRows({ db, table: 'turn_events', column: 'agent_id', value: 'agent-2' }),
    ).resolves.toBe(1);
    await expect(
      countRows({ db, table: 'goal_attachments', column: 'session_id', value: sessionId }),
    ).resolves.toBe(0);
    await expect(
      countRows({ db, table: 'goal_attachments', column: 'workflow_run_id', value: 'run-1' }),
    ).resolves.toBe(0);
    await expect(
      countRows({ db, table: 'goal_attachments', column: 'session_id', value: otherSessionId }),
    ).resolves.toBe(1);

    for (const [table, column, value] of [
      ['agents', 'session_id', sessionId],
      ['telemetry_records', 'session_id', sessionId],
      ['session_workflows', 'session_id', sessionId],
      ['diff_comments', 'session_id', sessionId],
      ['session_worktrees', 'session_id', sessionId],
      ['mount_pr_links', 'mount_id', 'worktree-1'],
      ['mount_operations', 'session_id', sessionId],
    ] as const) {
      await expect(countRows({ db, table, column, value })).resolves.toBe(1);
    }
    await expect(
      countRows({ db, table: 'sessions', column: 'id', value: otherSessionId }),
    ).resolves.toBe(1);
    await expect(listSessionsForWorkspace(db, workspaceId)).resolves.toHaveLength(1);

    await db.execute('UPDATE sessions SET archived_at = 1 WHERE id = ?', [sessionId]);
    await expect(listArchivedSessionsForWorkspace(db, workspaceId)).resolves.toEqual([]);
  });
});
