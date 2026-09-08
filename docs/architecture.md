# Repo architecture

> **Read this when** touching runtime systems around the app: subprocess
> environment, provider routing, DB migrations. **Not for** where new code
> goes inside `apps/desktop/src/` (see `docs/file-system.md`).

Owns the runtime systems that surround the React app: subprocess environment, provider routing, database migrations. In-app `src/` layout: [file-system.md](file-system.md). Monorepo tooling: [CONVENTIONS.md](../CONVENTIONS.md).

## Subprocess environment

macOS/Linux GUI apps launched from Finder/Dock inherit a minimal environment, not the user's terminal one. The Rust shell resolves the real environment from the login shell and replays it onto spawned processes (`apps/desktop/src-tauri/src/path_env.rs`).

The rule that decides which helper to use: anything running a user-authored script body replays the login environment (`command_with_login_env`, or `resolved_env()` for pty spawners that never build a `Command`); everything else takes PATH only (`command`). `run_git_push` replays it because a repo's `pre-push` hook can read variables exported in `~/.zshrc` (registry tokens, tool config). `PATH` and `TERM` are applied after the replay, so they win over whatever the profile exported. `login_shell()` is the single source for which shell to use, so the embedded terminal and the env probe never disagree.

Never skip hooks (`git push --no-verify`) to dodge a missing-env failure; replay the environment instead. Windows has no login-shell probe; this is macOS/Linux scoped.

## Provider system

- **The model registry is compiled, not stored.** Ids, family, cost tier, effort ladder, context window, routing weight and price are authored in the provider catalogs under `packages/core/src/providers/`. A model the app can run therefore ships with the app; there is no row to edit and no migration to write when the registry changes.
- **SQLite holds the overrides on top of that registry and nothing else**, at workspace, project and session scope. A stored value is a pin, never the definition of the thing it pins.
- **A stored pin is validated against the registry at read time.** A provider or model id the registry no longer carries falls back to the compiled default instead of reaching a spawn, so deleting a model from a catalog can never brick a workspace that pinned it.

## Database migrations

One migration per file, `mNNN-kebab-name.ts` under `packages/db/src/migrations/`, exporting a single `mNNNName` sql string. Register it in `index.ts` at the version in its filename.

Never edit a migration after it has shipped.

The runner (`runner.ts`) keeps a **set** of applied versions, not a high-water mark: a version already present in `schema_version` is skipped. So if two branches both add version N, whichever merges second finds N already applied on every machine that ran the first, and its migration never runs. No error, no warning, permanently. Renumber before merging. Two migrations that touch different tables need no ordering between them once renumbered.

Each migration is split into segments at `PRAGMA foreign_keys` boundaries. Every segment commits on its own and writes a checkpoint row in `schema_migration_segment`, so an interrupted migration resumes at the next segment instead of half-applying. Only the final segment stamps `schema_version` and clears the checkpoints.

A statement that fails with "already exists" or "duplicate column name" is treated as already applied: warned, not fatal.

`registry.test.ts` is the guard. It fails CI on a duplicate version, a gap in the range, or a filename that disagrees with its registered version, and it asserts that upgrading from every intermediate version reaches the exact schema of a fresh install.

When a file database has pending migrations at boot, the runner first writes a snapshot next to the database via `VACUUM INTO`: `data.db.pre-m<version>-<timestamp>.bak`, where `<version>` is the highest applied version at that moment. The two newest snapshots are kept, older ones are removed, and a snapshot failure aborts the migrations before any of them runs. This is the rollback path for irreversible migrations: from m117 onward the schema is unreadable by 0.1.x builds ([ADR 001](adr/001-workspace-project-rename.md)), so going back means restoring the snapshot file, not downgrading the app in place.

## On-disk data layout

Everything the app writes for itself lives under `~/.goodboy`:

- `data.db` is the SQLite database; its pre-migration snapshots (`data.db.pre-m*.bak`) sit next to it.
- `sessions/<workspace-slug>/<session-slug>-<id>/` is a session's container directory, for workspaces that did not configure their own sessions root. Repository project mounts use dedicated git worktrees under the repository's `.goodboy/worktrees/` directory. Several mounts of one project may belong to the same session.
- `workspaces/<slug>/PROFILE.md` is the one-way projection of a workspace's profile; the database row is the source of truth and the file is never read back.
- `file-versions/` holds the captured file version blobs.
- `query-<pid>.sock` is the query bridge socket of a running instance ([query-bridge.md](query-bridge.md)).
- `boot-breadcrumbs.log` records boot phase timings.

Two things live with the user's code instead: a folder project's session directories under `<project-root>/sessions/`, and skills under `<project-root>/.kay/skills/` or `<project-root>/.claude/skills/`.

## Mount persistence and recovery

`session_worktrees` is the logical mount table. Its row id is the mount
identity. A project id identifies the repository that owns the mount and does
not identify one checkout. Each mount owns its current branch, nullable current
path, last path, attachment state, disk observation and revision. The active
mount is stored on the session.

Pull request ownership lives in `mount_pr_links`, independently of the
branch-keyed provider caches. A switch can therefore clear the current provider
projection without deleting request history. `pr_series` and
`pr_series_members` store explicit grouping and order. They do not infer a
stack from commits.

Filesystem and provider mutations use `mount_operations` with a caller-owned
request id. The operation is recorded before the external action. Startup can
then finish a database transition when the worktree already exists or has
already disappeared. Provider creation refreshes the remote before retrying.
These checks make retry idempotent across the observable interruption points,
but they cannot infer an unrecorded historical request.

Hydration and archive restoration inspect every stored repository worktree
before projecting it as writable. A missing path is detached, kept as the last
path, and marked missing. Cleanup transfers dirty or otherwise unsafe paths to
`retained_worktree_paths` when the owning lifecycle needs to continue. All
cleanup entry points share the checked Rust removal boundary, and local
branches are preserved.
