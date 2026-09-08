# Traps

> **Read this when** something in the code or the toolchain looks like a bug
> and you are about to fix it. **Not for** how a system is meant to work
> (`docs/architecture.md`) or the conventions a change must follow
> (`CONVENTIONS.md`).

Comments are forbidden repo-wide, so a deliberate dead end cannot explain
itself where it sits. This file is where those explanations live. Everything
below has been "fixed" at least once and had to be put back.

## Deliberate dead ends

- Claude and Cursor report a turn's cumulative billing usage on the final
  `result`, but the live context size comes from the last `assistant` message.
  A tool-heavy turn emits several assistant messages, so using the first one or
  the final billing totals makes the context bar increasingly wrong as the turn
  continues. `parseAnthropicEnvelopeLine` deliberately retains the last
  assistant usage and attaches that value to the result event.
- `fetchIssueCandidates` returns `[]` for Bitbucket, and `issueSources.ts`
  has no Bitbucket entry. Goodboy deliberately does not expose Bitbucket
  issues, because Atlassian points issues at Jira. Adding the source entry
  alone ships a picker that lists nothing forever; the mobile companion
  refuses the same provider explicitly, in `commandExecutor.ts`.
- `RemoteHostKind` deliberately has no `'bitbucket'`: a Bitbucket remote
  classifies as `'other'`, and `remoteHost.test.ts` asserts exactly that.
  Adding the member changes that classification and fails the test. It is
  also not the union the pull-request surfaces switch on. That one is
  `PullRequestProvider`, which already carries `'bitbucket'`, so Bitbucket
  pull requests do not need a `RemoteHostKind` member to work.
- `resolve_threads` is the only verdict history. Migration `m140` moved every
  `pending_resolutions` row into it and `m143` dropped that table, so nothing
  reads a separate queue any more and a row's state is the answer. In-memory
  verdicts are derived from the row through `threadOutcome`, never rebuilt by
  replaying assistant messages; marker parsing writes rows, it does not own
  them. `resolve_publications` and `resolve_publication_threads` carry
  delivery, which is what makes an interrupted publish resumable.
- `RoutingPicker.onModel(model)` carries only the model string, not the
  provider selected in the picker. A consumer that rebuilds a provider-model
  pair from values captured by an earlier render can therefore commit the old
  provider with the new model. There are 11 production mounts across 10 files:
  `ChatInput`, `NotificationCenter`, `DiffViewerContent`, `RoleModelRow`
  (twice), `TaskModelRow`, `AgentSpawnConfig`, `WorkflowBuilderView`,
  `WorkflowStepCard`, `LibraryStepForm`, and `OrchestratorRoutingRow`. Keep the
  provider in current state or a ref when handling `onModel`. The contract
  itself has never been widened to close this: the same stale-pairing bug was
  fixed at the call site instead, independently, at least twice over
  (`RoleModelRow`/`TaskModelRow`, then `LibraryStepForm`/
  `OrchestratorRoutingRow` in #1307), each time by tracking the provider in a
  ref rather than by adding a provider parameter to `onModel`. This matters for
  more than transient UI: `LibraryStepForm` commits through
  `step_def_upsert`, whose Tauri command inserts or updates the SQLite
  `step_library` table.
- `LinkedPrChip` and `NewSessionView` read `[data-studio-overlay]` out of the
  DOM to tell whether a fullscreen studio is open, which decides in-session
  navigation in one and Escape handling in the other. The sniff exists
  because that state is split between the `sessionStudio` union in the store
  and the shell that renders every studio. Do not tidy it without
  centralizing fullscreen-studio state first.

## Hand-maintained lists the compiler does not check

Each of these is a set or array enumerated by hand alongside an exhaustive
type. Adding a member to the type forces the switch arms to be updated; it
never forces the list. Omission compiles clean and fails silently at runtime.

- `LENS_KINDS`, consumed in production only by `readPersistedLens`: a missing
  entry breaks lens restore with no error. A test asserts the set matches
  `LENS_LABEL`, so an omission is caught only once the label entry exists.
- `ALL_ISSUE_PROVIDERS` and `CREATE_SESSION_PROVIDERS` gate the mobile
  companion. Their `WorkspaceIntegrationProvider` switches (`fetchIssuesFor`,
  `resolveIssueForSession`) are `never`-checked and will demand an arm for a
  new provider, while the gating lists will not, leaving the provider absent
  from mobile issue queries and session creation.
- `PROVIDER_PRIORITY` ranks pull-request providers and also drives review
  target resolution. A provider missing from it still compiles, then vanishes
  from availability counts and fallback selection.
- `VALID_SORTS` and `VALID_GROUPS` validate persisted session-list
  preferences. A new sort or group key not listed here is read back as
  invalid, silently replaced by the default and written over.
- `SIMPLE_LENSES` marks the lenses that survive without a branch. A lens
  omitted from it is hidden or cleared for branchless sessions.
- `GITHUB_ONLY_KINDS` strips GitHub-only resolver actions from other hosts. A
  new GitHub-only action kind left out of it is offered where it cannot work.
- `MARKDOWN_SLOTS` decides which context slots render as markdown. A new
  prose slot left out renders through the plain path.

## Traps in the toolchain

- A new worktree needs `pnpm install`, and in this checkout that install
  exits 1 at the `prepare` step: `prepare` runs `lefthook install`, which
  refuses while `core.hooksPath` points at the shared `.git/hooks`. It is
  harmless. Dependencies and native bindings install before `prepare`, so
  check that `node_modules` and `better_sqlite3.node` exist and carry on. Do
  not repoint `core.hooksPath`: the hooks resolve their tools through the
  common git directory on purpose.
- A worktree installed with `--ignore-scripts` has no `better-sqlite3`
  binding, which `@goodboy/db` and `@goodboy/core` both need. The root test
  script runs `turbo run test --continue`, so every other package still runs
  and the tail of the output can look healthy while both of those suites
  errored out. Read the summary, not the last lines.
- Turbo replays cached task results, so a `FULL TURBO` green can be a replay
  rather than a run. When the green has to mean something,
  `pnpm exec turbo run test --force` and a log line reading `0 cached`.
- Neither `ci.yml` nor `rust.yml` has a `workflow_dispatch` trigger, so there
  is no "run workflow" button. Pushing another commit to the PR re-triggers
  them, and a finished run can be re-run from the Actions UI; closing and
  reopening the PR is the last resort, not the only route.
