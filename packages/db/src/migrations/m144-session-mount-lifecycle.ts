export const m144SessionMountLifecycle = `
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS session_worktrees_new;

CREATE TABLE session_worktrees_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  worktree_path TEXT,
  branch TEXT NOT NULL,
  parallel_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  project_id TEXT,
  mount_name TEXT,
  repo_slug TEXT,
  last_worktree_path TEXT,
  is_attached INTEGER NOT NULL DEFAULT 1 CHECK (is_attached IN (0, 1)),
  disk_state TEXT NOT NULL DEFAULT 'unchecked' CHECK (disk_state IN ('unchecked', 'present', 'missing', 'removed')),
  base_branch TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO session_worktrees_new (
  id,
  session_id,
  worktree_path,
  branch,
  parallel_index,
  created_at,
  project_id,
  mount_name,
  repo_slug,
  last_worktree_path,
  is_attached,
  disk_state,
  base_branch,
  revision,
  updated_at
)
SELECT
  id,
  session_id,
  worktree_path,
  branch,
  parallel_index,
  created_at,
  project_id,
  mount_name,
  repo_slug,
  worktree_path,
  1,
  'unchecked',
  NULL,
  0,
  created_at
FROM session_worktrees;

DROP TABLE IF EXISTS sessions_new;

CREATE TABLE sessions_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  state_kind TEXT NOT NULL CHECK (state_kind IN ('draft', 'starting', 'idle', 'running', 'error', 'ended')),
  last_activity_at INTEGER,
  provider_default TEXT NOT NULL DEFAULT 'anthropic',
  provider_allow_override INTEGER NOT NULL DEFAULT 1,
  default_provider_id TEXT,
  default_workflow_id TEXT,
  default_branch_prefix TEXT,
  parallel_enabled INTEGER CHECK (parallel_enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  auto_run INTEGER NOT NULL DEFAULT 0,
  title_user_edited INTEGER NOT NULL DEFAULT 0,
  archived_at INTEGER,
  deleted_at INTEGER,
  verbosity TEXT,
  effort TEXT,
  model_override TEXT,
  provider_override TEXT,
  provider_bindings TEXT,
  provider_enabled TEXT,
  active_project_id TEXT,
  active_mount_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (active_mount_id) REFERENCES session_worktrees_new(id) ON DELETE RESTRICT
);

INSERT INTO sessions_new (
  id,
  workspace_id,
  goal,
  state_kind,
  last_activity_at,
  provider_default,
  provider_allow_override,
  default_provider_id,
  default_workflow_id,
  default_branch_prefix,
  parallel_enabled,
  created_at,
  updated_at,
  permission_mode,
  auto_run,
  title_user_edited,
  archived_at,
  deleted_at,
  verbosity,
  effort,
  model_override,
  provider_override,
  provider_bindings,
  provider_enabled,
  active_project_id,
  active_mount_id
)
SELECT
  sessions.id,
  sessions.workspace_id,
  sessions.goal,
  sessions.state_kind,
  sessions.last_activity_at,
  sessions.provider_default,
  sessions.provider_allow_override,
  sessions.default_provider_id,
  sessions.default_workflow_id,
  sessions.default_branch_prefix,
  sessions.parallel_enabled,
  sessions.created_at,
  sessions.updated_at,
  sessions.permission_mode,
  sessions.auto_run,
  sessions.title_user_edited,
  sessions.archived_at,
  sessions.deleted_at,
  sessions.verbosity,
  sessions.effort,
  sessions.model_override,
  sessions.provider_override,
  sessions.provider_bindings,
  sessions.provider_enabled,
  sessions.active_project_id,
  COALESCE(
    (
      SELECT mount.id
      FROM session_worktrees_new mount
      WHERE mount.session_id = sessions.id
        AND mount.project_id = sessions.active_project_id
      ORDER BY mount.parallel_index, mount.created_at, mount.id
      LIMIT 1
    ),
    (
      SELECT mount.id
      FROM session_worktrees_new mount
      WHERE mount.session_id = sessions.id
      ORDER BY mount.parallel_index, mount.created_at, mount.id
      LIMIT 1
    )
  )
FROM sessions;

DROP TABLE session_worktrees;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE session_worktrees_new RENAME TO session_worktrees;

DROP INDEX IF EXISTS idx_sessions_workspace_id;
CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);
DROP INDEX IF EXISTS idx_sessions_active;
CREATE INDEX idx_sessions_active
  ON sessions(workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;
DROP INDEX IF EXISTS idx_sessions_archived;
CREATE INDEX idx_sessions_archived
  ON sessions(workspace_id, archived_at DESC)
  WHERE deleted_at IS NULL AND archived_at IS NOT NULL;
CREATE INDEX idx_sessions_active_mount_id ON sessions(active_mount_id);

DROP INDEX IF EXISTS idx_session_worktrees_session_id;
CREATE INDEX idx_session_worktrees_session_id ON session_worktrees(session_id);
DROP INDEX IF EXISTS idx_session_worktrees_path;
CREATE UNIQUE INDEX idx_session_worktrees_path ON session_worktrees(worktree_path);
DROP INDEX IF EXISTS idx_session_worktrees_repo_slug_branch;
CREATE INDEX idx_session_worktrees_repo_slug_branch ON session_worktrees(repo_slug, branch);
DROP INDEX IF EXISTS idx_session_worktrees_project_id;
CREATE INDEX idx_session_worktrees_project_id ON session_worktrees(project_id);
CREATE INDEX idx_session_worktrees_session_attached
  ON session_worktrees(session_id, is_attached, parallel_index, created_at, id);

CREATE TABLE mount_pr_links (
  id TEXT PRIMARY KEY,
  mount_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket')),
  host TEXT NOT NULL,
  repo_slug TEXT NOT NULL,
  pr_number INTEGER NOT NULL CHECK (pr_number > 0),
  head_branch TEXT NOT NULL,
  base_branch TEXT,
  url TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft', 'open', 'approved', 'queued', 'merged', 'closed')),
  snapshot_json TEXT NOT NULL,
  last_observed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (mount_id) REFERENCES session_worktrees(id) ON DELETE CASCADE,
  UNIQUE (mount_id, provider, host, repo_slug, pr_number)
);
CREATE INDEX idx_mount_pr_links_mount_id ON mount_pr_links(mount_id);
CREATE INDEX idx_mount_pr_links_request
  ON mount_pr_links(provider, host, repo_slug, pr_number);
CREATE INDEX idx_mount_pr_links_head_branch ON mount_pr_links(head_branch);

CREATE TABLE mount_operations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  mount_id TEXT,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('attach', 'unmount', 'switch', 'fork', 'remove', 'restore', 'retain')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'uncertain')),
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  input_json TEXT NOT NULL,
  result_json TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (mount_id) REFERENCES session_worktrees(id) ON DELETE SET NULL,
  UNIQUE (session_id, request_id)
);
CREATE INDEX idx_mount_operations_session_id ON mount_operations(session_id);
CREATE INDEX idx_mount_operations_mount_id ON mount_operations(mount_id);
CREATE INDEX idx_mount_operations_status ON mount_operations(status, updated_at);

CREATE TABLE retained_worktree_paths (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  source_session_id TEXT NOT NULL,
  source_mount_id TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  branch TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unmount', 'merge_cleanup', 'archive', 'session_delete', 'project_disconnect', 'settings', 'orphan')),
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX idx_retained_worktree_paths_workspace_id ON retained_worktree_paths(workspace_id);
CREATE INDEX idx_retained_worktree_paths_project_id ON retained_worktree_paths(project_id);
CREATE UNIQUE INDEX idx_retained_worktree_paths_path ON retained_worktree_paths(worktree_path);
CREATE INDEX idx_retained_worktree_paths_source
  ON retained_worktree_paths(source_session_id, source_mount_id);

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
`;
