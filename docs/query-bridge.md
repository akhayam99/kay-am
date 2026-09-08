# Query bridge

> **Read this when** you are changing what a spawned agent can ask a connected
> integration, or how it asks. **Not for** connecting an integration in the UI
> (`concepts.md`) or the subprocess environment in general
> (`architecture.md`).

An agent running under Goodboy is a child process on the user's machine. It can
read the repository and it can run `gh`, but the Linear, Jira, GitLab,
Bitbucket, Sentry and Slack connections the workspace owns are unreachable to
it: the secrets behind them live in the OS keychain, and only the Goodboy
process may open them. The bridge closes that gap without ever moving a secret.

## The invariant

**A secret never leaves the Goodboy process.** The agent does not receive a
token, a key, a header, or a URL that carries one. It names a workspace, a
provider and a verb; Goodboy resolves the credential, performs the call, and
returns the result. Anything that would hand an agent a usable credential, even
indirectly, is out of bounds and no convenience justifies it.

That is the whole reason the bridge exists rather than an MCP server or an
injected environment variable. It is also why the transport is a Unix socket
owned by the user with no other reader: the trust boundary is the OS account,
not a token the agent could copy, log, or forward.

## One catalog, three readers

A verb is declared once. The dispatcher routes it, the CLI parses and prints
it, and the prompt advertises it. None of the three owns the list; all three
read the same declaration, and a test fails when the advertisement drifts from
what the dispatcher can actually serve.

The dispatcher never reimplements a provider call. Every verb lands on the
function the app itself already uses for that integration, so a fix to a query
reaches the UI and the agent at the same time and there is no second GraphQL
document to keep honest.

## Read and write are not the same act

Reading an issue is inert. Posting a comment, merging, approving, or moving a
ticket is visible to other humans and cannot be taken back by re-running the
command. The two are dispatched through separate paths for that reason, and a
verb declares which one it is. Today both are allowed; the split exists so that
gating writes later is a policy change, not a refactor, and so that no write
can ever arrive by way of the read path.

Connecting, disconnecting and validating a connection are deliberately absent.
Those manage the credential itself and belong to the person at the keyboard.

## The advertisement is a cost

The list of available commands ships inside every prompt of every turn, for
every provider, forever. It names only the integrations this workspace actually
connected, and it stays at one line per provider: detail belongs in the CLI's
own help, which costs nothing until an agent asks for it. A workspace with no
connection produces no block at all.

The same text reaches every provider through the guard-block channel, so the
bridge is advertised identically whether the agent is Claude, Codex, Cursor,
Gemini or opencode. Nothing about it is provider-specific.

## The workspace is the container

`--workspace` (or `GOODBOY_WORKSPACE_ID`) names the workspace container, and a
connection is a binding on that container: one credential and one shared
configuration, with an optional per-project override row. A verb that reads
per-repository configuration accepts `--project <name>` to resolve against that
project's override first, falling back to the workspace-level binding when the
project carries none. On a verb that already owns a `project` argument, such as
a GitLab project path or a Jira project key, the flag keeps its verb-specific
meaning and sets no scope.

## A mount is named, never guessed

A session holds several mounts of the same project, each with its own worktree,
branch and pull request. `--mount <id>` is a universal flag, like `--workspace`
and `--project`, and `mount list` prints the ids. When a command that acts on a
mount is given none, the bridge serves it only if exactly one mount is eligible;
otherwise it refuses with `ambiguous_mount` and the candidates, and never falls
back to the first row.

`git checkout -b` is ambiguous, and no reading of git state settles it: the
worktree looks the same whether the agent moved this line of work to another
branch or opened a second one beside it. So the agent declares the intent.
`mount switch` moves the mount and leaves earlier pull requests as history;
`mount fork` creates another mount with its own worktree and leaves the source
untouched. When the observed head disagrees with the recorded branch, the app
stores the observation and refuses to act until `mount resolve --intent
switch|fork` says which reading is right.

Every mutation takes a `--reason` and a `--request-id`. The request id is
recorded before the app is asked to do anything, so a socket timeout answers
`operation_pending` rather than a failure: the work may well have happened, and
retrying with the same id returns the original result instead of creating a
second mount. The same id with different arguments is a `request_conflict`.
`mount operation --request-id <id>` reads that record back.

Creating a pull request is a mutation of the same kind: `github pr-create` and
`gitlab mr-create` need an explicit `--mount`, open a draft unless `--ready`,
and look the request up before creating another one, so a retry after a lost
answer does not open a duplicate.

A refusal may carry a machine-readable code beside its sentence:
`ambiguous_mount`, `mount_unavailable`, `branch_mismatch`, `branch_in_use`,
`unsafe_cleanup`, `operation_pending`, `request_conflict`. Codes are additive;
the envelope stays `{ok, data, error}`.

## No verb writes an event

There is no `session event` command. Typed actions record their own events
inside the transaction that performed them, and polling records the requests it
discovers on the host. Letting an agent write a lifecycle event would let it
assert a merge that never happened, and nothing downstream could tell the
difference.

## Where it is reachable

The socket is created when the app starts and removed when it stops, so an
agent outliving the app fails loudly instead of hanging. Windows has no Unix
socket and is not served.

## One socket per running instance

The socket file is named after the process that binds it, `query-<pid>.sock` in
the state directory. A fixed name can only ever belong to the newest process
that started, and the loss is silent: an installed build and a development
build both bind it, the second one wins, and the agents of the first keep
talking to a bridge that answers from another database with another set of
credentials. Naming the file after the owner removes the collision instead of
detecting it, and it is what lets a second window hold its own bridge later.

Nothing has to be cleaned up by hand. Before binding, a starting instance
removes the sockets in that directory whose owning pid no longer exists, which
is what a crash leaves behind, and never touches one whose owner is still
alive, including another live instance. The fixed-name socket earlier versions
bound is removed only when no listener answers on it, so upgrading does not
disturb an older build that is still running.

The CLI is not a second program. It is the same executable the user launched,
entered through the `query` first argument, which is answered and exited before
any window or plugin exists. One binary is what a macOS bundle actually ships,
so nothing has to be packaged beside it or resolved on PATH.

A spawned agent is told where that executable lives through `GOODBOY_BIN`, an
absolute path injected next to the socket and workspace variables. The prompt
advertises the call as `"$GOODBOY_BIN" query <provider> <verb>`, quoted because
the path may contain a space.

## Advertised and injected are the same condition

Having a connected integration is not the same thing as having a reachable
bridge, and a prompt that names a command the child cannot run is worse than
silence: the agent runs an empty path and reads a shell error instead of an
answer. So the advertisement is not gated on credentials. Both the injection
and the prompt read one predicate, true only when this process owns a bound
listener and its socket file is still there, and the frontend reaches it
through `query_bridge_serving` rather than inferring it. A frontend that cannot
reach that command reads it as false. The path handed to the child is the one
this process bound, so a child never inherits an address another instance owns.

That is what suppresses the block on Windows, where nothing ever binds, and
before the listener is up or after it is gone. The two can still disagree only
inside the instant between composing a prompt and spawning the child, and the
cost of losing that race is a command the agent is told about for one turn.
