# Concepts

> **Read this when** you need what a Goodboy object actually is: a workspace,
> a project, a session, an agent kind, a workflow run, a lens, a plan, a
> resolver, a permission rule, or how far an integration goes. **Not for** the
> code that implements them (`docs/architecture.md`) or how a surface should
> look (`DESIGN.md`).

What the app does today, defined once. Every other document links here rather
than restating a definition.

## The object model

Four nested things, and everything else hangs off them.

- A **workspace** is the container you work in, named after the thing you
  work on, not after a directory on disk. It owns a user profile, the
  integration bindings, one or more projects, and every session. A single
  repository is a workspace with one project; there is no separate
  single-repo mode, and no composite kind linking workspaces to each other.
  The old composite workspace is absorbed, not removed: every workspace is
  the container a composite used to be
  ([ADR 001](adr/001-workspace-project-rename.md)).
- A **project** is one place code or files live: a git repository (kind
  `repo`) or a plain folder (kind `folder`), with a root path on disk. A
  project belongs to exactly one workspace. It carries only what is truly
  per-place: its scripts, its settings override row, and an optional
  integration binding override.
- A **session** is a container for a goal: its own directory, budget and
  shared context. Sessions belong to the workspace, never to a project. A
  session starts with no worktree and no branch; per-project worktrees and
  branches appear on demand (see Lazy sessions below). Its stage (attention /
  running / review / building / done) is derived from what the session
  actually holds, never set by hand. "Refactor authentication domain" is a
  session.
- An **agent** is an independent chat thread inside a session. You spawn as
  many as you want, switch between them by clicking, and rename them inline.
  Each agent has its own provider, model, effort level, verbosity and kind.

These four words are the entire vocabulary, and each has exactly one meaning:
**workspace** is always the container, **project** is always the repo-or-folder
leaf, **session** is always the goal, **agent** is always the thread. Before
0.2.0 the leaf was called a workspace and five surfaces each worded its kinds
differently; that naming debt is paid, and no surface may reintroduce a synonym.
The new-workspace form still offers **Single project**, **Multi project** and
**Standalone**, but all three answers configure the projects of one container,
not different container kinds.

A session always has at least one agent, auto-spawned at creation. Spawning
more needs no workflow. Attaching a workflow preset pre-spawns one agent per
step, and those agents then live alongside any free agents you add.

A repo project must already have usable git state before a session can
materialize a worktree in it. **Goodboy never runs git init, never commits,
never adds a remote on your behalf.**

The order matters, and it is why the app looks the way it does: task first,
then the integrations a task comes from and returns to, then the code as the
artifact it produces, then chat as the last mile. Every surface follows that
order. One that shows chat before it shows the task is built upside down.

### The scoping ladder

Configuration lives at four scopes, and a value set closer to the work wins:
**global → workspace → project → session**.

- **Permission rules** exist at all four scopes; when several rules match a
  tool call, the most specific applicable scope decides.
- **Settings overrides** (default provider, branch prefix, verbosity, model
  pins, provider pool) are stored as an override row at workspace, project
  and session scope on top of the global defaults; an unset value inherits
  from an outer scope. The reading side still resolves session over workspace
  over global; the project row is stored but not yet consulted.
- **Workflows, the step library, and skills** are owned by the workspace. A
  step library row with no workspace is a global seed. Skills are discovered
  from the project roots but registered per workspace.
- **Project scripts** are owned by the project, the only object that knows
  its root path.
- **Integration bindings** resolve project override first, then the workspace
  binding (see Integration bindings below).

### Lazy sessions

A session is born on the workspace with only a **container directory**:
`~/.goodboy/sessions/<workspace-slug>/<session-slug>-<id>` by default, or under
the sessions root the workspace configured. No project worktree, no branch.

A project enters the session by being **materialized**, which mounts it into
the session: a repo project gets a git worktree inside the container, named
after the project; a folder project gets a plain directory under its own
`<project-root>/sessions/`. Materialization happens on demand, four ways:

- A workflow step that writes files reads the run goal, the step prompt and
  the consumed plan; a project named there is materialized before the step
  starts. This is how a planner declares which projects the work will touch.
- The **+ project** chip in the session's scope bar materializes one by hand.
- An agent asks through the query bridge:
  `"$GOODBOY_BIN" query project materialize <name> --reason "<why>"`.
- The first turn in a workspace with exactly one project materializes that
  project automatically.

Every materialization carries a mandatory rationale and is recorded as a
session event; a blank reason is refused before anything runs. The branch is
`<prefix>/<session-slug>`, and it is the same name in every project the
session materializes; the repository slug stamped on each mount is what tells
them apart. Until a project is materialized, agents may read its root but
every write must land inside the container or a mounted project.

### Activity as story

A session records what happened to it as an ordered stream of events: the
container and branches created, issues linked and unlinked, one pull request
per project through its lifecycle, workflow runs started and discarded,
decision changes, projects materialized with their rationale, materializations
refused with the failure, and external tasks created from Goodboy. The
timeline renders that stream grouped by day, so a session can be read back as
the story of the work rather than reconstructed from chat transcripts. An
action that cannot say why it happened, like a materialization without a
reason, is refused rather than recorded blank.

### The workspace profile

Each workspace carries at most one profile: a single free-form bio the person
writes in their own words, prompted as "Tell agents who you are and what you
do here". The bio is injected verbatim into every agent prompt as a guard
block, framed as what the person says about themselves; an empty bio injects
nothing. Saving the profile also projects it one way to
`~/.goodboy/workspaces/<slug>/PROFILE.md` as plain text; the database row is
the source of truth and the file is never read back.

### Integration bindings

A connection is a **binding on the workspace container**: one credential and
one configuration shared by every project, stored as a workspace-level row.
A project that needs a different account or configuration gets its own
override row, and resolution is project override first, workspace binding
second. GitHub is a binding provider like the rest, with one extra layer: a
workspace without a scoped credential falls back to the system `gh` CLI
login. Secrets stay inside the Goodboy process; a spawned agent reaches the
connections only through the [query bridge](query-bridge.md).

## Integration surface

The workspace is the aggregator of the work, so every integration surface
has to be readable inside Goodboy, not linked out to a browser tab.
"Integrated" has a fixed meaning here, and a mirror does not qualify:

- **See it**: the object rendered in full inside Goodboy, through the one
  shared page anatomy.
- **Act on it**: comment, reply, assign, transition, approve, merge, resolve,
  from the same screen.
- **Route it**: turn it into a session with the goal written, and follow it
  back out when the work ships.

Where each connected source stands, honestly:

- **GitHub.** Pull requests read and acted on (approve, request changes,
  comment, reply, resolve threads, merge, close); issues read and commented.
- **GitLab.** Merge requests read and acted on (approve, state changes,
  comment, reply, resolve and reopen threads); issues read, commented and
  edited.
- **Bitbucket.** Pull requests end to end: description, diff, build statuses
  in plain language, review threads, and eight verbs (approve, revoke,
  request changes, withdraw, comment, reply, merge, decline). No issue
  tracking by design: Atlassian points issues at Jira and Goodboy follows.
- **Jira.** Issues read in full and acted on: comment, assign, transition,
  edit description. Cloud only, one project key per binding, no sprints or
  boards yet.
- **Linear.** Issues read and routed, with two writes: the description and a
  comment. Assign and transition are still the open gap, because the state
  and team we read carry no id to send back. Linear is where the PM persona
  lives.
- **Sentry.** Issues and events read; no write path yet.
- **Slack.** Threads read and replied to (replies post as the connected user),
  routed into sessions with the goal pre-filled. The connection is per
  workspace; only the public channels the connected person has joined, and no
  call has run against a live workspace yet, only contract tests.

The rule for every integration: share the layout, never the logic. A Sentry
issue and a GitHub pull request look coherent side by side because the page
anatomy is one primitive, not because we pretended their data models are the
same. They are not.

## Core concepts

### Agent kinds

Ten agent kinds shape how an agent works. Every kind has a display label:
`planner` is **Plan**, `scout` is **Scout**, `implementer` is **Implement**,
`debugger` is **Debug**, `tester` is **Test**, `reviewer` is **Review**,
`pr-reviewer` is **PR reviewer**, `docs` is **Docs**, `resolver` is
**Resolve**, and `generic` is **Generalist**. Their compact badge labels are
separate, for example `generic` uses `gen`. Each kind carries default model,
effort, and optional system prompt settings.
Kind is inferred automatically from the agent's name or first user message, or
chosen explicitly when the agent is spawned. Nine are pickable in the spawn
menu; **resolver** is spawned only by the resolve UI.

### Workflows

A workflow is a reusable sequence of steps. Attach a preset from the sidebar,
or assemble your own in a custom builder. A workflow can carry an optional
goal, overridable per run.

- **Runs are instances.** Attaching a workflow starts a run; the same workflow
  can be re-run any number of times in a session, each run independent.
- **Trigger modes** decide when a run begins: run on attach (default), wait
  for a manual start, or chain after a predecessor run completes. A chained
  run waits for the one before it, then proceeds on its own.
- **Drafts survive session switches.** A workflow you're building in the
  editor is kept as you move between sessions, and cleared once you create or
  discard it.
- **Natural language drafts a workflow.** Describe what you want and Goodboy
  formats a draft of the steps, which you then edit before attaching.

### Shared context

Agents inside the same session do **not** share their conversation history.
What they share is the **session record**, surfaced on the session overview:
goal, decisions and session summary as ordered regions, with what the session
produces (workflows, agents, resolve, questions, diff, plans) as sections of
the same page. The LLM auto-populates goal, decisions and summary after every
turn; you can also edit them by hand.

Each of those surfaces is a **lens**: a view onto the session, reached from
rows and chips on the overview, expanding in place or opening a side panel,
and rendered as markdown where it is prose.
Chat is one destination among them, not the frame around them: switching
agents swaps the transcript, the overview stays where it is, because the
record belongs to the session and not to the agent. This is the layer that
lets independent agents collaborate on the same goal without
cross-contaminating their threads.

Context is a resource, not a dump.

A **turn** is one user prompt and one agent response, including the streaming
events between them.

### Plans

Planner agents emit structured plans wrapped in `<<plan>>...<</plan>>`
markers. These become first-class session artifacts, not buried in chat
transcripts. Plans have lifecycle status (active / consumed / superseded) and
are consumed by other agents who act on them. Consumption is tracked, and
plans are viewable in a dedicated studio that renders them as a tree. A plan
is also where a planner declares the projects the work will touch, which is
what materializes them when an implementing step starts.

### Review conversations

A diff comment is a user's annotation on a line under review. A review
conversation is the durable record of one review, issue or diff comment: a
`resolve_threads` row carrying its state, its verdict, its reply draft and the
commit shas that answer it. A fix attempt is a `resolve_attempts` row: one
agent working one or more conversations with a local commit, never a push.
Attempts run serially on the session worktree so two fixes cannot race over
the same branch, and a restart rebuilds every row from the database instead of
from a transcript.

Nothing reaches GitHub until a publication runs. A publication freezes the
conversations it will publish, pushes the branch once if code has to travel,
then posts each reply and resolves each thread, recording every step so an
interrupted run resumes without posting twice. One publisher owns that path;
there is no second way to push a reply or close a thread.

### Permission rules

A permission rule matches a tool and chooses allow, deny, or ask at global,
workspace, project, or session scope; the most specific applicable rule wins.
Provider capability determines enforcement. A denied headless call blocks the
turn; approval is explicit and retryable.

### Provider routing & balance

Register your AI providers. `ProviderId` contains `anthropic`, `cursor`,
`codex`, `gemini`, `opencode`, `openrouter`, and `moonshot`; the provider
picker displays them as **Claude**, **Cursor**, **Codex**, **Gemini**,
**OpenCode**, **OpenRouter**, and **Moonshot**, respectively. Set priorities.
Set budgets. Enable or disable providers per session. Goodboy routes work to
the right provider automatically.

- Provider 1 passes its budget threshold, work moves to provider 2. You pick the
  threshold; it defaults to 80% of the cap.
- Quick task, fast cheap model. Complex architecture, best available model.
- Each workflow step picks its model automatically by role, tier, and cost; an
  explicit pin overrides the auto choice.
- You see the spend in real time. No surprises at end of month.

Choosing a model is one control, mounted in many places: an axes-based picker
(provider, model, version, variant, effort) rendered from the compiled
catalog. How it works is owned by [model-picker.md](model-picker.md).

### Cost awareness

Every interaction is metered, locally. Goodboy gives you total visibility on
what you're spending and where, in real time.

- **Token usage**: input/output tokens per request, per session, per provider,
  per model.
- **Estimated cost**: live cost estimate based on provider pricing, with
  running totals per session.
- **Session lifecycle metrics**: when a session starts, resets, hits a
  threshold, switches provider, ends.
- **Budgets**: per-provider monthly cap, per-session soft cap. Visual alerts
  before you hit limits. Caps steer routing rather than lock you out: when
  every provider is over cap the composer says so and you can still send the
  turn on the provider you picked.

All metrics are computed and stored locally. Nothing transmitted.

### Skills & automation

Local skills live with the code: markdown files with frontmatter discovered
from `<project-root>/.kay/skills/*.md` or
`<project-root>/.claude/skills/<name>/SKILL.md` across every project of the
workspace, registered per workspace. Invoke from chat via `/skill-name`.
Parsed by the skill registry, executable across any connected provider.
Per-workspace, not global. Not locked into any single AI provider's
ecosystem.

### Editor integration

Goodboy is the brain. Your editor is the hands. When it's time to write code,
Goodboy opens your editor on the right worktree, in the right branch. VS Code
and Cursor are detected automatically; when both are available, a dropdown
lets you pick. When the code is done, control returns to Goodboy.
