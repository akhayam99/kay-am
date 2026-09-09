export const m151ResolveQueueItemRefusal = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS resolve_queue_items_new;

CREATE TABLE resolve_queue_items_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 0),
  reopened_from_item_id TEXT REFERENCES resolve_queue_items_new(id) ON DELETE RESTRICT,
  candidate_revision INTEGER NOT NULL CHECK (candidate_revision >= 0),
  approval_state TEXT NOT NULL CHECK (approval_state IN ('none', 'accepted', 'deferred', 'wont_fix')),
  approved_revision INTEGER,
  approved_reply_hash TEXT,
  deferred_at INTEGER,
  delivered_at INTEGER,
  superseded_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  integrated_sha TEXT,
  UNIQUE (session_id, thread_id, generation)
);

INSERT INTO resolve_queue_items_new (
  id, session_id, thread_id, generation, reopened_from_item_id, candidate_revision,
  approval_state, approved_revision, approved_reply_hash, deferred_at, delivered_at,
  superseded_at, created_at, updated_at, integrated_sha
)
SELECT
  id, session_id, thread_id, generation, reopened_from_item_id, candidate_revision,
  approval_state, approved_revision, approved_reply_hash, deferred_at, delivered_at,
  superseded_at, created_at, updated_at, integrated_sha
FROM resolve_queue_items;

DROP TABLE resolve_queue_items;
ALTER TABLE resolve_queue_items_new RENAME TO resolve_queue_items;

CREATE INDEX IF NOT EXISTS idx_resolve_queue_items_session ON resolve_queue_items(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resolve_queue_items_thread ON resolve_queue_items(thread_id);
CREATE INDEX IF NOT EXISTS idx_resolve_queue_items_reopened_from ON resolve_queue_items(reopened_from_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_resolve_queue_items_live_thread ON resolve_queue_items(session_id, thread_id) WHERE superseded_at IS NULL;

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
`;
