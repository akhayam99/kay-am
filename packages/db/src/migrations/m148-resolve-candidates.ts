export const m148ResolveCandidates = `
ALTER TABLE resolve_queue_items ADD COLUMN integrated_sha TEXT;

CREATE TABLE resolve_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  base_sha TEXT NOT NULL,
  candidate_sha TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('building', 'ready', 'integrated', 'stale', 'discarded')),
  integrated_sha TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_resolve_candidates_session ON resolve_candidates(session_id, created_at);

CREATE TABLE resolve_candidate_items (
  candidate_id TEXT NOT NULL REFERENCES resolve_candidates(id) ON DELETE CASCADE,
  queue_item_id TEXT NOT NULL REFERENCES resolve_queue_items(id) ON DELETE CASCADE,
  item_revision INTEGER NOT NULL,
  PRIMARY KEY (candidate_id, queue_item_id)
);

CREATE INDEX idx_resolve_candidate_items_item ON resolve_candidate_items(queue_item_id);
`;
