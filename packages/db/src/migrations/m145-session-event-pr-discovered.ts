export const m145SessionEventPrDiscovered = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS session_events_new;

CREATE TABLE session_events_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'worktree_created',
    'branch_created',
    'branch_switched',
    'issue_linked',
    'issue_unlinked',
    'pr_created',
    'pr_discovered',
    'pr_ready',
    'pr_approved',
    'pr_merged',
    'pr_closed',
    'workflow_started',
    'workflow_discarded',
    'workflow_restored',
    'workflow_deleted',
    'decisions_changed',
    'project_materialized',
    'project_materialization_refused',
    'project_materialization_proposed',
    'project_materialization_dismissed',
    'project_detached',
    'external_task_created',
    'rebase_requested'
  )),
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

INSERT INTO session_events_new (id, session_id, kind, payload_json, created_at)
  SELECT id, session_id, kind, payload_json, created_at
  FROM session_events;

DROP TABLE session_events;
ALTER TABLE session_events_new RENAME TO session_events;

DROP INDEX IF EXISTS idx_session_events_session_id;
CREATE INDEX idx_session_events_session_id ON session_events(session_id, created_at);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
`;
