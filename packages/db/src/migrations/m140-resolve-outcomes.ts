export const m140ResolveOutcomes = `
CREATE TABLE IF NOT EXISTS resolve_threads (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  project_id TEXT,
  pr_number INTEGER NOT NULL,
  thread_id TEXT NOT NULL,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('review_comment', 'issue_comment', 'diff_comment')),
  state TEXT NOT NULL CHECK (state IN ('open', 'working', 'needs_answer', 'fixed', 'answered', 'failed', 'publishing', 'closed')),
  state_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  active_attempt_id TEXT,
  disposition TEXT CHECK (disposition IN ('fix', 'reply', 'no_change')),
  reply_draft TEXT,
  commit_shas_json TEXT CHECK (commit_shas_json IS NULL OR json_valid(commit_shas_json)),
  question TEXT,
  reply_posted_at INTEGER,
  reply_id TEXT,
  github_resolved INTEGER CHECK (github_resolved IN (0, 1)),
  closed_at INTEGER,
  closed_source TEXT CHECK (closed_source IN ('goodboy', 'github')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (session_id, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_resolve_threads_session_state ON resolve_threads(session_id, state);
CREATE INDEX IF NOT EXISTS idx_resolve_threads_attempt ON resolve_threads(active_attempt_id);

CREATE TABLE IF NOT EXISTS resolve_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  thread_ids_json TEXT NOT NULL CHECK (json_valid(thread_ids_json)),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  effort TEXT,
  instructions TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('queued', 'running', 'waiting', 'finished', 'failed', 'cancelled')),
  started_at INTEGER,
  ended_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resolve_attempts_session ON resolve_attempts(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resolve_attempts_agent ON resolve_attempts(agent_id);

CREATE TABLE IF NOT EXISTS resolve_imports (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, version)
);

INSERT OR IGNORE INTO resolve_threads (
  id, session_id, pr_number, thread_id, origin_kind, state, state_reason,
  disposition, reply_draft, commit_shas_json, reply_posted_at, created_at, updated_at
)
SELECT id, session_id, pr_number, thread_id,
  COALESCE((SELECT agents.source_kind FROM agents
    WHERE agents.session_id = pending_resolutions.session_id
      AND agents.source_kind IN ('review_comment', 'issue_comment', 'diff_comment')
      AND (agents.source_thread_id = pending_resolutions.thread_id
        OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(agents.source_thread_ids) THEN agents.source_thread_ids ELSE '[]' END)
          WHERE value = pending_resolutions.thread_id))
    ORDER BY agents.ordinal, agents.id LIMIT 1), 'review_comment'),
  CASE WHEN outcome = 'resolved' OR (outcome IS NULL AND commit_sha <> '') THEN 'fixed' WHEN outcome = 'wontfix' THEN 'answered' ELSE 'needs_answer' END,
  CASE WHEN outcome = 'resolved' OR (outcome IS NULL AND commit_sha <> '') THEN NULL WHEN outcome = 'wontfix' THEN 'legacy_wontfix' ELSE 'review_legacy_result' END,
  CASE WHEN outcome = 'resolved' OR (outcome IS NULL AND commit_sha <> '') THEN 'fix' WHEN outcome = 'wontfix' THEN 'no_change' WHEN outcome = 'analyzed' THEN 'reply' ELSE NULL END,
  reply, CASE WHEN commit_sha = '' THEN NULL ELSE json_array(commit_sha) END,
  reply_posted_at, created_at, created_at
FROM pending_resolutions;
`;
