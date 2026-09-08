export const m146PrSeries = `
CREATE TABLE pr_series (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  work_item_identifier TEXT,
  work_item_url TEXT,
  planned_count INTEGER CHECK (planned_count IS NULL OR planned_count > 0),
  parent_request_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_pr_series_session_id ON pr_series(session_id);
CREATE INDEX idx_pr_series_project_id ON pr_series(project_id);
CREATE UNIQUE INDEX idx_pr_series_name ON pr_series(session_id, project_id, name);

CREATE TABLE pr_series_members (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  mount_id TEXT,
  branch TEXT,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'omitted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (series_id) REFERENCES pr_series(id) ON DELETE CASCADE,
  FOREIGN KEY (mount_id) REFERENCES session_worktrees(id) ON DELETE SET NULL,
  UNIQUE (series_id, ordinal)
);
CREATE INDEX idx_pr_series_members_series_id ON pr_series_members(series_id, ordinal);
CREATE INDEX idx_pr_series_members_mount_id ON pr_series_members(mount_id);
CREATE UNIQUE INDEX idx_pr_series_members_branch
  ON pr_series_members(series_id, mount_id, branch)
  WHERE mount_id IS NOT NULL AND branch IS NOT NULL;
`;
