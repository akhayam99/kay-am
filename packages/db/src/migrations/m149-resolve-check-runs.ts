export const m149ResolveCheckRuns = `
CREATE TABLE resolve_check_runs (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES resolve_candidates(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  test_identity TEXT,
  breadth TEXT NOT NULL CHECK (breadth IN ('scoped', 'full')),
  base_tree TEXT NOT NULL,
  candidate_tree TEXT,
  accepted_set TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'failed', 'errored')),
  exit_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  log_ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_resolve_check_runs_session ON resolve_check_runs(session_id, created_at);

CREATE INDEX idx_resolve_check_runs_candidate ON resolve_check_runs(candidate_id, created_at);
`;
