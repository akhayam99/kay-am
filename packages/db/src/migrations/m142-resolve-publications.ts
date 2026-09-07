export const m142ResolvePublications = `
CREATE TABLE IF NOT EXISTS resolve_publications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  branch TEXT NOT NULL,
  local_head TEXT NOT NULL,
  remote_head TEXT,
  commit_shas_json TEXT NOT NULL CHECK (json_valid(commit_shas_json)),
  requires_push INTEGER NOT NULL CHECK (requires_push IN (0, 1)),
  phase TEXT NOT NULL CHECK (phase IN ('previewed', 'confirmed', 'pushing', 'pushed', 'posting', 'finished', 'failed', 'cancelled')),
  pushed_head TEXT,
  confirmed_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resolve_publications_target ON resolve_publications(repo, pr_number, phase);
CREATE INDEX IF NOT EXISTS idx_resolve_publications_session ON resolve_publications(session_id, created_at);

CREATE TABLE IF NOT EXISTS resolve_publication_threads (
  publication_id TEXT NOT NULL REFERENCES resolve_publications(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  prior_state TEXT NOT NULL,
  reply_body TEXT,
  reply_phase TEXT NOT NULL CHECK (reply_phase IN ('pending', 'sending', 'posted', 'uncertain', 'skipped')),
  reply_id TEXT,
  reply_posted_at INTEGER,
  resolve_phase TEXT NOT NULL CHECK (resolve_phase IN ('pending', 'resolving', 'resolved', 'uncertain', 'skipped')),
  resolved_at INTEGER,
  error TEXT,
  PRIMARY KEY (publication_id, thread_id)
);
`;
