# Changelog

Release notes for Goodboy, newest first. `.github/workflows/release.yml` reads
the section for the version being tagged and uses it verbatim as the GitHub
release body and the in-app updater's notes. Add the entry for the next
version in the same PR that bumps the version numbers (see
`docs/release-command.md`), before the tag is pushed: the release build fails
if it can't find a matching `## Goodboy vX.Y.Z` heading.

## Goodboy v0.2.17

Images an agent writes into the worktree now render in place, every
comment Goodboy posts carries a signature you can turn off, summarizers
switch providers instead of stalling on a usage limit, and GPT-6 Astra
joins the codex model catalog.

### [#1676] Images an agent writes now render in place

An image an agent writes into the worktree used to show up as a bare
file path. It now renders, both in a message written as markdown and
in the tool call that produced it, so you see the picture instead of
reading its location.

### [#1675] Every comment Goodboy posts now says so

Every comment Goodboy posts to GitHub, GitLab, Bitbucket, Jira, Linear
or Slack now ends with a line saying it was written by Goodboy. A
workspace setting turns the attribution off; it ships on by default.
A review summary carries the signature once rather than on every
inline comment.

### [#1674] Summarizers switch providers instead of retrying a dead one

A summarizer that hit its provider's usage limit used to keep asking
the same provider and fail on every turn. It now switches to an
aligned model on another connected provider, puts the exhausted one
on cooldown, and says so once instead of retrying forever.

### [#1671] GPT-6 Astra joins the codex model catalog

OpenAI's GPT-6 Astra is now available for agents from the codex model
catalog, priced and placed in the automatic routing order alongside
the rest.

### [#1677] The inbox no longer forces a selection

The inbox used to force-select the first item on open, so its empty
summary state was unreachable. Selection is now yours, and the item
header carries a close control that takes you back to nothing
selected.

### [#1673] Resolver outcomes persist across restarts

What a resolver decided, committed or drafted on a pull request
review comment now lives in the database instead of being rebuilt by
re-reading the transcript, so it survives a restart. No visible
change on its own; it is the ground for further resolve work.

## Goodboy v0.2.16

The website's landing page rewrites around what Goodboy does for you,
most tauri commands move off the desktop app's main thread, the
sentry lens retires into the inbox, and budget merges into impact
studio.

### [#1665] Website: the landing page rewrites around what the app does

The public website, not the app itself, rewrites its landing page
around what Goodboy does for you rather than how it's built, answers
a review right on the scrolling provider belt, and updates the
structured data to match.

### [#1666] 72 tauri commands move off the main thread

Of 86 tauri commands that used to run synchronously on the desktop
app's main thread, 72 now run off it; only terminal and provider
write and resize, and db_path, stay sync on purpose. Skill upsert,
delete and rescan no longer hold the database lock while they touch
disk, so a slow scan can't stall everything else waiting on it.

### [#1667] The sentry lens retires into the inbox

The sentry lens is gone. Sentry issues now open in the inbox with the
record focused, the way every other integration already works. The
inbox gains a session scope chip and an unlink action on sentry
records, five orphaned goodboy:open-*-studio listeners are deleted,
and cmd+alt+3 is unbound.

### [#1668] Budget merges into impact studio

Budget is no longer its own surface: it merges into impact studio as
one rail alongside the four impact sections, plus spend by provider
and by session, behind a single window picker. A spend section sits
under overview, and budget leaves settings and the more popover.
goodboy:open-budget-studio stays as an alias so old links keep
working.

## Goodboy v0.2.15

Every lens and detail page now names the session you're in, its title
renders the way you typed it, the activity timeline gains workflow
steps and a rebase suggestion that remembers what happened, mounts
stay write-only on every path, and four separate changes make the app
boot and stream faster.

### [#1648] The rebase suggestion remembers it ran

Clicking Rebase on the activity suggestion used to leave the row
sitting above NOW, only relabeled "Rebasing", as if nothing had
happened. The suggestion now drops out the moment the agent starts,
and comes back only if the base branch moves further ahead or the
rebase fails.

### [#1659] A session eyebrow above every page

Every lens and detail page now shows a small line naming the session
above its own title, so you don't lose track of which session you're
in while deep inside Questions, Plans, Workflows, Scripts, or a linked
GitHub, Linear, Sentry, GitLab, Jira or Slack panel. Click it to
return to the overview.

### [#1660] Session titles render inline markdown

A goal written with backticks, bold or italic used to show the raw
markup everywhere the title appeared. Session titles now render
inline code, bold and italic on the overview header, board cards,
sidebar rows and breadcrumbs, so formatting shows up the way you
typed it.

### [#1658] Workflow steps join the activity timeline rail

Workflow steps now draw on the same rail as the activity timeline,
with one marker per step status and dashed segments running into
steps that haven't started yet, instead of the separate numbered tree
the workflow page used before. Steps read the same visual language as
the rest of the app.

### [#1649] A side rail for manifests in scripts

Projects with several package manifests used to pile every workspace
package into a stack of collapsibles. Scripts now show a side rail
listing every manifest with its script count, so you can jump between
the root and any workspace package directly instead of scrolling
through folds.

### [#1651] Inbox: Enter opens, Clear filters stays visible

Enter on the selected inbox row now opens it in the launch dock, and
Cmd/Ctrl+Enter there still starts the session. Clear filters now sits
in the rail itself whenever a search, kind or provider filter is
active, not only inside the empty detail view.

### [#1657] Board cards get mount and resolve actions

Board cards now offer the same actions as the activity suggestions,
with the same icons: mounting a pending project, up to two at a time,
and resolving open review comments, alongside the existing run and
question actions.

### [#1650] Every mount path stays write-only

Two more paths could mount a project on sight: a bridge command, and
workflow step declarations that mounted every project named in the
step text. Both now go through the same write-only check as
everything else, so a project either one would have mounted becomes a
proposal you approve instead, capped at two mounts per request.

### [#1653, #1654, #1655, #1656] Faster

Four changes cut time off boot and runtime. Reading a project's git
status now takes three git processes instead of up to ten. Settings,
the guide, workflows, the inbox, the diff viewer and six more studios
now load only when you first open them, and the terminal loads only
once one mounts. Together, that's roughly 900 kB off the window's
boot bundle. A long streaming transcript now updates incrementally
from its last snapshot instead of rebuilding from scratch on every
tick.

### [#1652] Icon sizes unified across every feature

The icon size token pass from the last release now covers the rest of
the app: about 230 remaining icon sizes across just over 100 files
read from the same three size tokens as everywhere else, so nothing
is left sized as a one-off number.

## Goodboy v0.2.14

Session switches stop freezing the app, suggestions move into the
activity timeline, agents stop mounting projects they only read, the
inbox and the scripts pane are rebuilt around how you triage and run
things, and settings live on one surface.

### [#1645] Suggestions above NOW, mounts only to write

Suggestions now sit in the activity timeline above the NOW mark as
compact rows with their action, on a dashed rail so they read as not
done yet; the activity filter can hide them. The overview block is
gone. Agents are told that reading a project needs no mount and that
a project is materialized only to write to it. A mount the goal does
not name is no longer created on the spot: it becomes a suggestion you
approve or dismiss, and at most two mounts happen per turn.

### [#1646] One icon language

Projects, mounts, worktrees, run states and the common actions
(archive, delete, rename, restore, open outside) now share one glyph
each across the app, glyph sizes come from three tokens instead of
scattered numbers, session stages and suggestions read the same icon
map everywhere, and the footer integration strip is muted for
providers that are not connected.

### [#1644] Session switch off the main thread

Opening a session froze the window for three to four seconds. Git and
database commands now run off the main thread, the overview reads one
shared git status per mount instead of five, and the timeline and the
mount rows show skeletons while the first data lands.

### [#1642] Inbox as a triage list

A wider list with search, kind tabs and labeled provider chips that
always show their counts, records grouped by age (today, yesterday,
this week, older) with the urgent ones first, two-line rows, the first
record selected on open, arrow-key navigation, and a compact summary
instead of an empty placeholder. A provider deep link with no records
no longer hides the whole inbox behind an invisible filter.

### [#1643] Scripts pane, project first

Pick a project in a rail and see only its scripts: your own first, then
the manifest scripts of that mount with the root package open and the
workspace packages collapsed. Every package shows what it holds through
category badges, and inside a package the scripts are grouped by what
they do (dev, build, test, lint, typecheck, format, database, generate,
install, deploy, clean, docs) with an icon and a color each. Search
counts matches on the other projects too.

### [#1638] Settings on one surface

App, workspace, providers and models, and budget settings share one
Settings studio with a scope rail. The footer buttons, the command
palette, Cmd/Ctrl+, and every deep link (a provider, a section, a
budget scope) land on the right scope of that surface, and the old
per-surface events keep working. Deep links scroll to their section
even when it mounts late.

### [#1637] One workflow draft engine

The Workflow Studio, the in-session builder and the step library form
edit the same draft model with one validation and one effort clamp.
Resetting a step's model to auto now clamps the effort against the
model that will actually run, and a workflow without steps can no
longer be saved.

### [#1639] Suggestions block hidden when empty

The session overview no longer shows a "Suggestions" heading when the
only suggestions belong to other surfaces.

### [#1641] Model picker lands on the newest version

Switching the model group in the picker (Opus, Sonnet, Fable) selects
the newest version of that group instead of the oldest, so Opus means
Opus 5 unless you pick an older one.

## Goodboy v0.2.13

The inbox becomes the only door to your integrations, with one detail
shell behind it, and Claude Fable 5.1 joins the catalog.

### [#1630] Integration studios retire behind the inbox

Tracker chips, the board's merge request click, the footer glyphs and
the onboarding links all open the Inbox now, preselected on the right
provider, kind or record. The old per-provider studio events keep
working and land in the same place. The workspace studio shells for
GitHub issues, GitLab, Linear, Sentry, Jira, Slack and Bitbucket are
gone; session-scoped surfaces (a session's PR panel, the review hub)
are untouched.

### [#1635] One detail shell for every record

The eight provider detail panels share a single header (provider
glyph, identifier, title, state, external link, provider actions) and
a single launch dock, so starting a session from an issue, a merge
request, a thread or an error looks and behaves the same everywhere.
GitLab merge requests gain the launch affordance; Sentry's two detail
implementations become one.

### [#1631] Claude Fable 5.1

Fable 5.1 is in the Anthropic catalog with its own pricing and sits
above Fable 5 for the thinking roles; code roles keep their Opus
defaults. It needs Claude Code 2.1.251 or newer on your machine.

## Goodboy v0.2.12

A fix for session overviews freezing the app, and one inbox reading
work from every connected provider.

### [#1632] Opening a session no longer freezes the app

On v0.2.11, opening a session whose overview suggested a rebase could
lock the whole app; the overview now stays responsive.

### [#1629] One inbox for every integration

The new Inbox, reachable from the footer, reads work items from every
connected provider in one surface: GitHub, GitLab, Linear, Jira,
Sentry, Slack and Bitbucket. The rail carries search, provider chips
and a kind filter with counts (issues, PRs and MRs, threads, errors)
over newest-first rows; the detail side keeps each provider's panel,
so launching a session from a record works exactly as in the studios.

The per-provider studios are untouched; they stop being destinations
in a later phase.

## Goodboy v0.2.11

Scripts you can actually read, one home for resolve work, questions that
stay on the timeline after you answer them, and a single engine deciding
what to suggest next. Plus a cost fix that matters.

### [#1623] The Scripts page grows a hierarchy

The wall of wrapping project chips becomes one scrollable row of tabs
with counts. User scripts group per project under collapsible headers,
manifest packages collapse by default with the root package open, each
header naming its package manager and script count, and a search box
filters both sections while auto-expanding whatever matches. Running
scripts pulse, and the topbar counter now also counts scripts still
running in archived sessions.

### [#1625] [#1627] Resolve moves into the review board

The review lens is now the one home for resolve work: Review, Threads
and Resolvers tabs cover drafts and diff, thread triage with single,
batch and combined resolver spawns, resolver lanes and the batch push
of queued resolutions. The GitHub Studio Resolve tab, the resolve lens
and their duplicated triage lists are gone; old links land on the
review lens, the board's draft-comments chip finally opens it, and
amend/squash live in the diff lens where commits are.

### [#1624] Questions stay on the timeline

Open questions used to vanish from the session timeline the moment you
answered them. They now render as artifacts in the asking agent's lane,
colored like the rest of its chain, coalescing consecutive rows the way
context changes already do, and staying visible after consumption with
their answered or dismissed state.

### [#1626] One suggester to rule the next step

Overview next steps, the composer's plan-ready card and the sidebar
nudge now come from a single suggestion engine with one ranking:
questions to answer first, then a workflow step ready to start, a plan
ready to run, review threads worth resolving, and branches behind main
worth rebasing. Same look everywhere, same predicates, no more two
opinions about whether a plan is ready.

### [#1620] The summarizer is locked out of tools

The session summarizer's spawn never disabled built-in tools, so a
strong model pinned to the summarizer role could wander off exploring
the repository at your expense instead of summarizing the turn. The
spawn is now locked down, matching the planner.

## Goodboy v0.2.10

Notifications grow up: fewer of them, grouped where they repeat, and an
inbox that is actually pleasant to triage. Autorun also stops tripping
over its own summarizer.

### [#1618] The notifications inbox is rebuilt around groups

The Notifications Studio no longer renders a flat pile of identical
cards. Repeated failures stack into one row with a count, the newest
entry up front and the older ones a click away, each row carrying its
severity accent, unread state and context. A severity filter and an
unread-only toggle sit next to the existing bulk actions, and clearing
a filter is one click when it hides everything.

### [#1616] Fewer notifications, better ones

A dozen notification emitters that stated the obvious (session created,
branch changed, title generated, summary saved, and friends) are gone;
what remains is actionable. Unrelated errors of the same severity no
longer collapse into one entry, and the boundary-drift warning now
carries an Open agent button that takes you straight to the drifting
agent's chat.

### [#1615] Static autorun waits out the summarizer

A static workflow whose step finished while the session summarizer was
still running silently dropped its auto-advance; the run sat idle until
something else poked it. Autorun now waits for the summarizer with a
bounded gate (and proceeds anyway if it hangs), the same discipline the
dynamic orchestrator already had, without holding your turn hostage
while it waits.

### [#1614] Spawning an implementer from the brief fans out again

Spawning an implementer from a planner's brief ignored the plan's
clusters and started a single agent, while the same plan spawned from
the plan card fanned out correctly. The brief path now passes the plan
through, so both entry points behave the same.

## Goodboy v0.2.9

Your project's own scripts show up by themselves, the breadcrumb earns
its place, and the app stops freezing on heavy git work.

### [#1611] Manifest scripts appear on their own

The Scripts surface now lists every script your project already defines:
the root package.json, every workspace package in a monorepo (pnpm or npm
workspaces), and composer.json, grouped per package with the package
manager detected from the lockfile. Nothing is imported or duplicated;
the list is scanned fresh when you open the lens, and discovered scripts
run, stop and survive a reload exactly like the ones you write by hand.

### [#1609] Deleting and fast-forwarding no longer freeze the app

Deleting a session or worktree and fast-forwarding a project ran their
git and filesystem work on the thread the interface depends on, so the
whole window locked until they finished. That work now runs off the main
thread; the app stays responsive throughout.

### [#1610] The breadcrumb earns its place

The session breadcrumb now carries section icons, the live status of the
selected agent, and the pending count on the resolve crumb, with a
clearly readable current step. Scripts and terminal also stop sharing
near-identical icons everywhere they appear.

### [#1607] Every detail page lines up with the overview

Agent, resolver, pull request and integration detail pages used to put
secondary chips above a smaller title at a different height than the
overview. Every detail surface now leads with its title at the same size
and offset as the overview, with the chips below.

### [#1608] Split work is labeled for what it is

An agent that fans its work out to children showed them as "scouts" no
matter what they were, while the parent claimed it had not started. The
group is now named after its children, and the parent says it delegated
and how many children are still running.

### Under the hood

Knip gains a production pass in CI, funding a sweep of dead exports and
test-only modules [#1606]; the sweep orphaned one unused rust command,
removed in [#1612].

## Goodboy v0.2.8

Base branches become a real picker, suggested next steps stop spawning
twice, and the resolver keeps one commit per thread instead of stacking
them.

### [#1597] Base branch is a searchable select

The three base branch fields (overview project row, git pill, settings)
were free-text inputs even though the branches are known. They are now a
searchable select that fetches the repo's local and remote branches the
moment the picker opens, never on page render. Typing still works: an
unlisted branch can be committed as free text, and one action returns to
the default.

### [#1598] The suggested next step is a real card with a real state

The next-step suggestion in the transcript was a bare chip: clicking it
spawned an agent, then stayed clickable and could spawn duplicates, with
no trace of what it started. It is now a proper card that follows its
spawned agent: while the agent runs it shows the live status, when it
ends it says so, and a second spawn is impossible. The spawned agent is
linked back to the message that suggested it.

### [#1599] The resolver amends instead of stacking commits

Asking the resolver for further changes on a thread it already resolved
produced a new commit every time, even though the resolution was still
local. The resolver now amends its own unpushed resolution commit, keeping
one commit per thread, and the queued resolution follows the new commit so
the batch push resolves GitHub threads against a commit that exists. Once
a commit is on a remote the resolver falls back to normal commits and
never rewrites shared history.

### Under the hood

App.tsx went from 1163 lines to a 335-line shell: shortcuts live in a
dedicated hook [#1600] and every workspace overlay sits behind one overlay
router [#1603], with no behavior change. Dead weight left with [#1601]
(test-only panes and a sidebar filter subsystem no UI reached) and [#1602]
(eight tauri commands nothing invokes). A new CI gate [#1604] keeps the
rust command registry and the frontend invocations in lockstep both ways,
and the event bus inventory landed in docs/event-bus.md.

## Goodboy v0.2.7

Errors stop hiding, work survives a refresh, and agents route around a
provider that hits its limit instead of dying on it.

### [#1590] A provider at its usage limit is routed around

When a provider announces its usage limit mid-run, the turn now fails
properly, reroutes to another connected provider, and puts the limited one
on cooldown until the reset time the message declares. If no alternative
exists, one notification names the reset time and the run retries itself
when it arrives. Before, the error was swallowed and every retry burned
against the same wall.

### [#1588] Scripts and terminals survive a refresh

Reloading the app no longer orphans running scripts and terminals: the
processes always survived in the background, but the interface forgot
them, leaving servers holding ports with no way to see or stop them. The
app now re-attaches at startup, the running indicator returns, and stop
works on recovered runs. [#1592] adds a small activity dot on each project
row's terminal and scripts icons while something is alive there.

### [#1591] Chained workflows start when their predecessor finishes

An after-run workflow could miss its predecessor's completion and wait
forever, most visibly behind orchestrated runs. Every completion path now
wakes the chain evaluation, and loading a workspace un-stalls chains left
behind by earlier versions.

### [#1584] The resolver judges threads on the merits

The fix and analyze preset modes are gone: one hint field remains, and the
resolver decides per thread whether to implement the change or leave a
justified wontfix, never steered by a preset. [#1594] also gives the
resolver its own row in the Provider Studio role models, so its default
model is finally yours to set.

### [#1583] Replies follow the language you write

The reply language now anchors to the latest message you wrote in the
session instead of the goal's language, so writing Italian into an
English-goal session no longer earns an English answer. Machine-initiated
steps still fall back to the goal.

### [#1575] Errors reach the bell

System failures (audit retries, context near the limit) were collected in
a state no surface ever rendered. They now land in the notification bell
as coalesced, persisted entries.

### Fixes

- Session delete keeps what analytics and links need and purges the heavy
  data: transcripts and turn events go, metrics keep counting. [#1582]
- Deleting or archiving a session evicts every per-session cache through
  one declared registry with a compile-time completeness gate. [#1580]
- Sessions left running by a crash reconcile on every load, not only on a
  workspace switch. [#1576]
- The needs-you popover shows its per-reason icon and tone again. [#1574]
- The draft-comments chip on a board card opens the review board, and
  Review locally lands inside it. [#1577]
- Workflow lane colors start from a per-session seed: the first lane is no
  longer always violet, adjacent lanes stay far apart in tone. [#1578]
- The orchestrator queues concurrent decide and advance requests instead
  of dropping them, so a turn finishing mid-decision cannot stall a run.
  [#1579]
- While the orchestrator chooses the next step, the timeline shows a
  spinner in the lane color and the board reports the session as running.
  [#1593]
- A plan produced by an agent chain joins the chain's colored lane on the
  timeline instead of floating on the spine. [#1586]
- Claude turns no longer see personal claude.ai connectors: integrations
  flow through the app, identical for every provider. [#1587]
- Codex agents reach the network and the in-app bridge from their sandbox,
  so pushes and bridge verbs work without switching provider. [#1585]
- The worktree menu (open in editor, copy path) sits on each project row
  and targets that mount; the header keeps it only for sessions without a
  repository. [#1595]

## Goodboy v0.2.6

Codex agents stop fighting their sandbox, stopping a run stops being
destructive, and the notification panel learns to count.

### [#1565] Codex agents can commit and mount again

Codex agents in session worktrees died on every commit because the sandbox
blocked git's own metadata, and mounts requested mid-run never appeared.
The sandbox now covers each mounted repository's git directory and the
in-app query bridge, so commits land and a requested project is ready
inside the same run. A failed turn no longer loses the mounts it asked
for.

### [#1567] Pausing autorun lets the step finish

Turning autorun off used to kill the step in flight. It is now an instant,
safe pause: the running step completes and no new one starts. The
immediate kill is a separate Stop now action with its own confirmation.

### [#1568] One notification per story

Cluster handoffs now produce a real summary instead of raw output behind a
permanent warning, and the notification panel folds repeats into a single
group with a count, inline expansion and per-group retry and dismiss. The
bell badge counts stories, not repeats.

### Fixes

- A project row with changes and no pull request offers Create PR again,
  or Create MR on GitLab remotes, opening the studio on the create panel.
  [#1572]
- The chain glyph on trace chips sits beside the label again instead of
  overlapping it. [#1566]

## Goodboy v0.2.5

Branches get real names, scripts get their bearings and every workflow gets
its own color.

### [#1561] Branches named after the work, prefixed the way you asked

A session linked to GRW-1220 used to mount a branch called
goodboy/untitled-session-48c535d9. The branch prefix setting is now honored
everywhere a branch is cut, resolving project, workspace and global scopes
in that order. The name derives when the project mounts: the linked task
identifier plus the goal, so the same session now yields
ak/grw-1220-applicare-nuove-icone-alla-navbar. Sessions without a task use
their goal; untitled ones fall back to a short session id.

### [#1562] Scripts open where you are

Opening scripts from a project row lands on that project's scripts, with
All one click away. The overview header regains a scripts shortcut for the
workspace-wide view. Projects and scripts sort alphabetically, and group
headers carry a count so long lists stay scannable.

### [#1563] Every workflow lane keeps its own color

Two workflows in one session could draw the same color in the activity
trace, and one palette slot was nearly identical to the app accent. Lanes
now take distinct colors in creation order, starting from violet, and the
look-alike slot is gone.

## Goodboy v0.2.4

The board scales past a handful of projects and the overview earns its keep.

### [#1558] One git pill however many projects you mount

Three or more repository projects now share a single pill in the board
header: a summed badge for everything that needs action, a warning when any
checkout does, and a popover that lists every project sorted by urgency.
One click drills into the full detail for a project: counts, base branch,
fast-forward, open in editor. Two projects or fewer keep their own pills.
When fast-forward is blocked, the reason now reads right under the button
instead of hiding in a tooltip.

### [#1559] Detach with confidence, edit the base where you see it

Detaching a project now confirms inline: a clean worktree says it will be
removed, uncommitted changes stay on disk with the path spelled out and a
toast to find them later. The base branch is editable right on the
"Compared with" row of the sync popover, where the comparison already
lives. The rebase toast can open its agent the moment it starts, and
detached-project rows in the trace stopped pretending to be links.

Both surfaces also breathe better: a shared gutter, clearer section
separation and denser project rows.

## Goodboy v0.2.3

The board sheds its git banner and every project picks its own base branch.

### [#1553] The board header carries a git pill per project

The full-width main checkout band above the board is gone. Each repository
project now shows a compact branch pill next to the board controls, with a
count badge when there is something to act on: commits to pull, uncommitted
changes, conflicts. The detail, the fast-forward action, open in editor and
the first-time git setup guide all live in the pill. Workspaces with several
projects finally see the state of each checkout, not just the first one.

### [#1554] Choose the base branch per project

Everything assumed main: new session branches, diffs, rebases, sync state and
new pull requests. Each project now carries its own base branch, editable
from the git pill on the board and from the workspace settings. Leave it
empty and Goodboy follows the repository's default branch on its own.

### Fixes

- A burst of decision changes filled the activity trace with one row each;
  consecutive rows now collapse into one with the summed counts. [#1555]
- The session cost sits next to the context gauge instead of floating in the
  breadcrumb, and stray dividers under the breadcrumb, the Board button and
  the sidebar stage labels are gone. Filter buttons share one icon. [#1556]

## Goodboy v0.2.2

The session decides where it works. Projects mount as you go, and the app now
shows them, filters by them, and gives each one its own controls.

### [#1549] The overview gives each project its own row

A session that mounts several projects used to show git state for one of them
at a time. Now every mounted project gets its own row in the overview: the
branch, the diff so far, its pull request, and terminal and scripts buttons
that open in that project. Rebase and push live in a single sync control on
the row, with a badge when the branch is behind main and the full
ahead/behind detail one click away. Mounting another project is one action at
the top of the page.

The Plan and Pull requests lists are gone from the overview: plans keep their
own view, and pull requests live on the project rows and in the activity
trace. In their place, a Suggestions section appears only when there is
something worth doing: review comments waiting for a resolver, or a branch
behind main ready to rebase.

### [#1550] Start a session from an issue without picking a project

Launching a session from a Linear or GitHub issue, or from Sentry, GitLab,
Jira, Slack or Bitbucket, no longer asks which project to use. The session
starts empty and the agent mounts the projects the goal actually needs.
Reviewing a pull request still opens on the repository the pull request
belongs to.

### [#1551] See and filter sessions by project

Each session in the sidebar shows the project it has mounted, or a count with
the names on hover when there are several. A shared filter in the sidebar and
on the board narrows both to the projects you pick, with a bucket for
sessions that have not mounted anything yet.

### Fixes

- An agent created between two workflow steps stays at its own time in the
  activity trace instead of jumping below the workflow (#1547)
- Merged shows purple with the merge icon everywhere, including the activity
  trace, and approved uses the same check icon as the rest of the app (#1548)
- Agent labels sit centered in their chip, with the chain link pinned to the
  left edge when the agent is part of a chain (#1548)

## Goodboy v0.2.1

The first week on the new shape. Scripts, integration keys and plans now
follow the project they belong to, and the parts of the app that were still
reading the old one are fixed.

### [#1542, #1537] A script belongs to a project

A script now names the project it belongs to and runs in that project's
worktree for the session you are in, so a session that mounts several
repositories runs each script where it was written to run. When that project
is not mounted in the session the run is refused with the reason on the
button, rather than running somewhere else.

In a workspace with more than one project the list groups by project, chips
filter it to one, and the editor picks the project for a new script. With a
single project the panel looks exactly as it did.

### [#1538] Integration keys resolve per project

A session working in a project that has its own Linear, Sentry, GitLab, Jira
or Bitbucket connection now uses that connection, and falls back to the
workspace one otherwise. GitHub follows the same order.

A connection whose key has gone missing from the keychain says so in
settings instead of reporting itself as connected, which is what an upgraded
workspace looked like when a key did not come across.

### [#1536] The overview shows the review work waiting

The session overview carries a Resolve section: the unresolved review
comments on the session's pull request, the resolvers still open, or the
resolutions waiting to be pushed, whichever applies. Clicking it opens
resolve. With nothing waiting the section is not there.

### [#1534] Group workspaces is gone from settings

Settings no longer offers to merge whole workspaces into each other. Adding
a project whose folder lives in another workspace still offers to move it
across, which is the same job one project at a time.

### Fixes

- Scripts run again. Every script failed to start after the upgrade to
  v0.2.0 [#1535]
- Exporting and importing your configuration works again, and an exported
  file now carries the projects of each workspace; a file from an older
  version still imports [#1535]
- The mobile companion builds its snapshot again [#1535]
- The branch name on the overview updates after an agent renames the branch,
  without a reload [#1540]
- A plan whose workflow run was discarded no longer sits in the overview as
  if it were still the plan of the session [#1541]

## Goodboy v0.2.0

Goodboy changes shape: the workspace is now the place where a whole context
lives, with the repositories and folders you work on as projects inside it.
Sessions start empty and grow into the projects they actually touch, telling
that story as they go.

### The workspace holds projects

What used to be a workspace, one repository, is now a project. A workspace is
the container above it: name it after the company or the context,
link the projects that belong there (api, app-web, website, infra). A single
repository still works exactly as before, as a workspace with one project.
The old composite workspaces dissolve into this model; existing data is
migrated in place, and the active composite becomes a workspace with its
members as projects.

### Sessions start empty and explain themselves

Creating a session asks for nothing at all: it opens untitled, and the title
writes itself from your first message unless you set one by hand. No branch,
no worktree, no upfront choice of repositories. When work needs to write into a project, that
project is materialized: a worktree and a branch appear, and the session
records why, in plain words, in its activity timeline. Agents can request a
project themselves, with a reason, while planning or mid-conversation; you can
add one by hand with the "+ project" chip. Pull requests are tracked per
project, and the session page shows the whole story in one document: goal,
linked work, plan, workflows, PRs, activity. The lens sidebar is gone; the
left panel is your sessions, the rest happens on the page.

### An empty session says where to start

A session with nothing in it used to open on an empty Activity section. In its
place there are now two ways in, create an agent or add a workflow, and under
them the open issues from the trackers this workspace has connected: five per
tracker, without the ones another session already picked up. Choosing one links
it, writes the goal if the session has none, and titles the session after it.
With no tracker connected, or none with anything open, the line says so and
carries the glyphs that open each studio. All of it steps aside for good the
moment the session's first activity lands.

Answered questions read in the activity feed as their own category, so they can
be filtered like everything else, and the terminal and the scripts are one click
away from the session header, next to the folder and the archive.

### Integrations connect once per workspace

Linear, Sentry, Slack, Jira, Bitbucket, GitLab and GitHub now bind at the
workspace, so every project inside shares the connection; a project can carry
its own config where that matters. GitHub tokens join the same credential
system as everyone else, with the gh CLI still available as a fallback.
Secrets stay in the OS keychain, unchanged.

### Goodboy knows who you are here

Each workspace keeps a profile: a short bio in your own words, asked once
during onboarding and editable in Settings. Agents read it and adapt: a
non-developer gets outcomes instead of raw diffs, a platform engineer gets
cross-project reasoning. The profile is also written to a PROFILE.md file
under ~/.goodboy for your own reference, never with secrets in it.

### One-way door, with a copy of the key

First boot on 0.2.0 migrates the database to the new shape, and 0.1.x cannot
read it afterwards. Before migrating, Goodboy saves a snapshot of the database
next to the original; restoring that file is the way back if anything goes
wrong. The sessions you already had come across with their history, each one
attached to the project it worked in. The migration also clears years of accumulated dead weight: unused
columns, an unreachable parallel-groups feature, mixed timestamp formats, and
missing foreign keys.

Slack connects as you instead of as a bot, the activity feed stops rewriting
what it shows, and a popover that opened as a sliver opens at full height
again.

### [#1522, #1528] Slack connects as you, not as a bot

Slack asked for a bot token, which meant a second identity in your workspace:
Goodboy could only read the channels that bot had been invited to, and every
reply and reaction it sent arrived under the bot's name.

The connection now takes your own user token. It reads the public channels you
have joined, with no invitations to hand out, and replies and reactions go out
under your name. The five permissions it asks for are unchanged.

Getting that token used to be four steps on Slack's own site, with one of them
easy to get wrong. Goodboy now carries a ready app into Slack's creation flow:
one button, then install and paste. If you already made an app for Goodboy,
a second path adds the permissions to the one you have rather than starting
another. A connection you made with a bot token keeps working exactly as it
did until you choose to replace it.

Follow-up: the app description and the permission names come from Slack's
published reference, and no connection has been made from Goodboy to a live
workspace with a user token yet. If Slack rejects one, its own message comes
back on the connect form with what you pasted still in it.

### [#1518, #1526] Popovers open at their full height

A popover anchored to a small control was capped at the height of the control
itself, so it opened as a sliver a few pixels tall with its contents cut off,
and the Activity filter looked like it refused to open. Twelve popovers were
affected, among them the branch chip, the reviewer picker, the pull request
switcher, the Jira transition and assignee menus and the run spend limit.

They now take the room actually available between the control and the edge of
what encloses them, scroll inside themselves when the content is taller than
that, and flip above the control when there is more room up there. The Activity
filter also lists its seven categories one per row again, instead of two abreast.

### [#1524] A chain marks the agents in it, it does not rename them

An agent that had spawned others lost both its role and its name in the
activity feed: the role chip was replaced by a neutral `Chain` badge, and the
name by an arrow path of up to three descendants. The row said it was a chain
and stopped saying what it was.

The role and the name are back. The coloured lane still draws the tree, and
every agent in a chain, the one that started it and the ones it spawned, now
carries a small chain link on its role chip.

### [#1525] A discarded run reads as discarded

A discarded workflow run was drawn like a live one in the activity feed, and
merely a little pale everywhere else, sitting next to completed runs at almost
the same weight. Its lane, the lanes of everything under it, and its chip now
recede together while keeping the run's own colour, so the run stays
recognisable and reads as over. The cards and rows that show it elsewhere all
quote one shared value now, instead of each carrying its own.

### [#1523] The sidebar lists the integrations you have

The session sidebar offered all six integrations whether or not they were
connected, with the unconnected ones dimmed and badged. It now lists the ones
this session can reach. A provider you never connected is simply not there, and
the footer keeps offering the full set when you want to add one. A provider
that went away but still holds work here, a linked issue or an open pull
request, keeps its row.

### [#1527] Restoring a run is written down

The feed recorded a workflow being discarded and said nothing when it was
brought back, so it kept reporting a run as discarded after it was live again.
A restore is now part of the trace, filed under the same filter as the discard.

### [#1519, #1521] Report screenshots attach to the issue

Reporting an issue with screenshots offered to create a public repository on
your GitHub account to host them. That offer is gone, and nothing was ever
created by it.

The screenshots now go to the same place they land when you drag them into a
comment, attached to the issue Goodboy files and visible in its body. If that
upload does not go through, the report is still filed and the images are still
staged on disk, with one click to open the issue and the folder side by side.

## Goodboy v0.1.84

The activity feed becomes a full trace of everything the session did, and
every agent, not only Claude, can reach the workspace's connected
integrations.

### [#1505, #1510, #1511] The activity feed records the whole session

The feed only showed what could be derived from agents and runs, so a branch
switch, a merged pull request or an unlinked issue left no trace. The session
now keeps a persisted log. The trace opens with the worktree and its copyable
path, and every branch created or switched, issue linked or unlinked, pull
request created, approved, merged or closed, workflow discarded or deleted,
and decision change lands as its own row in the tone of what happened.

A filter on the Activity header picks which categories show and persists
across sessions. The count of hidden categories sits next to the icon, so a
filtered feed never looks empty by accident. Decisions start hidden.

An agent that spawned followers reads as a chain: a colored lane like a
workflow run, labeled with the path of names instead of a stepper.

### [#1508, #1514, #1515, #1516] Any agent queries the connected integrations

Only Claude could reach Linear, through MCP, and paid tokens for it on every
turn. Any agent Goodboy runs (Claude, Codex, Cursor, Gemini, opencode) can now
read and act on Linear, Sentry, GitLab, Jira, Bitbucket and Slack through a
`query` command the app serves from its own binary. 53 verbs, each backed by
the same call the app itself makes, on macOS and Linux.

The credential never leaves Goodboy. The agent names a provider and a verb,
the app runs the query with the key it already holds, and nothing the agent
receives can be replayed against a provider API. Each running instance serves
its own bridge, so an installed app and a dev build never answer for each
other.

Follow-up: no query has gone out to a live provider from an agent turn yet.
If a provider rejects one, its own error reaches the agent and the exit code
says so.

### [#1504] The follow-up section tracks the agents it spawned

Spawning a follow-up was a dead end: the suggestion stayed, the toast faded,
and the agent it created was nowhere on the page. A spawned suggestion now
turns into a live status row with the agent's kind, name, current state and a
**Go to chat** button. The suggestions still on offer carry the colored chip
of the role they would start.

### [#1506] A new session links several tasks and drafts its goal

A session could start from exactly one issue. The picker now stays open and
appends, each linked task gets its own chip with its own remove control, and
switching the provider tab keeps what is already picked. From two tasks on,
an action next to the goal field drafts one goal covering all of them, still
yours to edit.

### [#1509] Report screenshots land inside the GitHub issue

Report an issue used to stage the screenshots in a folder and ask you to drag
them onto GitHub yourself. They now land inside the issue: on first send the
app asks before creating a small public assets repository on your account,
uploads the images there and embeds them in the body. A decline or a failed
upload files the issue exactly as before, drag reminder included.

### [#1507] Rename an agent and run the next step in place

Renaming an agent needed a double click on its sidebar card, and the title on
its own page was read-only. The detail header now renames in place, double
click or the pencil on hover. A run waiting between steps offered its next
step only in the workflow detail. The session overview now carries the same
button in an Up next band above the feed.

### Fixes

- The orchestrator card drops its spend and budget lines and actions. The
  spend limit keeps its place in the run header and the budget its own studio
  (#1503)
- With two binaries in the crate, `pnpm tauri dev` could not pick one and
  died on startup (#1513)

## Goodboy v0.1.83

The session Overview becomes a live activity feed, Context becomes two editable
surfaces, and an integration key you save once is offered to every project.

### [#1446, #1461, #1470, #1476, #1484] The Overview is the activity feed

A session's history was only readable by piecing together the workflow rail, the
agents list and the chat. The Overview is now one chronological feed of
everything that happened, newest first, with the block above it carrying the
request, the pull request and the running cost.

Each run owns a coloured lane drawn beside the spine, so a workflow and its
steps read as one thread rather than as a flat list. A lane departs from the
spine where its run starts, carries its steps, and merges back where it
finishes. What has not happened yet is dashed, what has is solid. Plans,
decisions and open questions appear inline at the moment they were produced,
and each row opens the surface it belongs to.

The chip on a row takes its lane colour and names what the row is, with the
kind's own glyph beside it.

### [#1442, #1462, #1475, #1483] Context is two surfaces you can edit in place

Goal, decisions and session summary were three sidebar entries for one thing
seen at three moments. Context is now a single lens holding Session summary and
Decisions, each with its own heading, glyph and tone, and the goal moved up into
the Overview where it is read first.

Editing works on the block you clicked rather than on the whole markdown
document, and a round trip preserves the bytes it did not touch. Decisions read
as rows instead of a wall of prose.

### [#1482] An integration key saved once is offered to every project

A credential is now its own object rather than a value copied into each project.
Connect GitHub, Linear, Sentry or Jira once with a personal API key and every
workspace is offered it, with the option to override it for a single project.

Follow-up: the key is stored in the app database, not the system keychain.

### [#1437] The footer shows what is connected, and one way to add

The integration groups in the footer are gone. The left side is the glyphs of
what is actually connected, each opening its studio and named by its tooltip,
followed by a single action to link a new one.

### [#1439, #1458] A workflow preset is built on the canvas

Creating a preset opened a dialog on top of the canvas, put its controls off
screen, and made a workflow vanish from the rail when it moved to draft.
Generation now happens on the canvas itself, a preset can be duplicated, and the
autosave indicator stops strobing between saving and saved on every keystroke.

### [#1433, #1465, #1489] An open question is answerable where you read it

Suggested answers sit on one row, each chip capped and truncated with its full
text on the title, and the suggested one comes first. A question can offer
checkboxes as well as radio buttons, and the send control is a compact button
rather than a full row of blue.

An open question also appears in the Brief of the step that is waiting on it,
since a step blocked on a human is state, not conversation.

### [#1440, #1464] Report an issue is compact and confirms in the app

The form leads with its title, guesses the kind from what you wrote, and
confirms in the app instead of throwing you into a browser. Attached files take
the full width of the drop zone.

Follow-up: an attached image still travels as a filename in the issue body,
since the GitHub issue API takes no upload. The files are written to a temp
directory and Finder opens on them.

### [#1460] Finished work is visible without asking for it

Completed workflows, agents, resolvers, questions and plans were behind a
toggle in the middle of the screen. Every lens now shows active work at the top
and finished work below it, each with its own state.

### [#1467, #1491] The orchestrated launch view fits on one screen

The Models by role block, seven selects deciding models for steps that do not
exist yet, is gone. In its place the form picks the model and effort the
orchestrator itself runs on. Switching approach no longer turns autorun back on
behind you.

### [#1436, #1457, #1466] The model picker offers only what you connected

Several surfaces received the connected provider list and rendered the whole
catalog anyway. The picker is one ladder over connected providers, ends with an
entry that opens Providers inside the app, and drops rows a model does not have.
A model chosen mid-chat is the model the next turn runs on.

### [#1448, #1468, #1481, #1492] One breadcrumb ladder across every lens

Selecting an agent, a resolver or a workflow step used to unmount what you were
reading and rebuild the trail from a new root. There is now one crumb ladder,
the parent comes from the object rather than from the surface you jumped from,
and the parent stays mounted while you move between its children.

### [#1449, #1459, #1474, #1493] One canon for actions, measures and type

Actions live in one place per surface, nothing truncates without a way to see
the rest, every detail surface shares one column width, and one type scale runs
across the panes. Concept tones stop colliding: a plan is violet rather than the
green a resolver uses. Every icon-only control says what it does on hover, and
archiving asks for confirmation the way deleting already did.

### [#1456, #1477] An agent leads with its outcome

The composer stopped taking a stack of full rows, and the four bordered stat
cards in an agent's Brief are one compact metadata line, so the transcript gets
the vertical space.

### [#1480] One language per session, chosen from the goal

A workflow whose goal was written in Italian drifted into English partway
through, decision by decision, including inside sub-steps. The session's
language is now settled from the goal once and carried into every step.

### [#1432] Autorun is a deliberate choice

A run no longer inherits autorun when nothing asks for it. A stored session
preference is still honoured, and discarding a workflow stops filing it under
completed.

### [#1443] A degraded handoff explains itself, and a stuck step recovers

`degraded handoff` said nothing about what had happened. It now names what was
thinned and what survived, and a step that ended in error offers a way forward
that does not involve typing the right sentence into the chat.

### [#1463, #1469] Session creation and Resolve read as decisions, not columns

Creating a session reads as three decisions with the integration glyph on the
task it came from, and the create action sits next to the branch name. The
Resolve lens shows the work it used to hide, and its header stops resizing when
you move between its tabs.

### Fixes

- A popover clamps to the viewport and keeps its action row visible, on every
  tall popover in the app, not only the one that was reported [#1434]
- Setup checklist items are clickable and lead to what they name [#1435]
- A goal created from a Linear task keeps its whole description, past the old
  1200 character cap [#1435]
- A step panel stops losing the newest turn to a read-modify-write race [#1441]
- A plan names its consumer when that consumer is a workflow step [#1445]
- An orchestrated workflow is named after its goal instead of a counter [#1447]
- Sidebar icons stop shifting by a pixel when you hover a row [#1478]
- Context shows what the session holds instead of an empty pane on reopen [#1485]
- A day rule draws only where two days meet, never directly under NOW [#1486]
- The running marker pulses a filled dot inside its ring [#1487]
- A marker occludes the lane it sits on, and a role says its full name [#1488]
- Pending steps head the feed and their lane reaches them [#1490]
- Feed timestamps show hours and minutes, and NOW keeps its dot [#1495]
- Every run keeps its own lane instead of falling back to the spine [#1494, #1496]
- The brand mark is the plain foreground lockup on a brand tile, in the top bar
  and in the app icon [#1497]

## Goodboy v0.1.82

Goodboy fast-forwards your checkout without a terminal, tells you when it cannot
read your repository instead of calling it in sync, and the first-run checklist
finally agrees with the app around it.

### [#1419] Repository status says when it cannot read your checkout, and offers a fast-forward

Goodboy used to report "In sync and clean" whenever it could not work out the
state of your repository, so a failed read looked exactly like a healthy one. It
now says it cannot read the checkout and names what went wrong: git could not
compare this branch with its upstream, git could not resolve a main branch to
compare against, or git status could not be read.

A file in conflict used to count twice, once as staged and once as unstaged. It
counts once now, as conflicted, and a merge, rebase, cherry-pick or bisect left
in progress shows in the panel now, where nothing read it before.

When your branch is behind its upstream and the tree is clean, the checkout
panel offers a fast-forward that names the branch and the upstream it will move.
It never rebases and never stashes. When it cannot run, the control stays
visible and disabled with the reason on it: uncommitted changes, no upstream, an
operation in progress, a status Goodboy could not read, or a branch already up
to date. A checkout Goodboy cannot read disables it exactly like a dirty one.

Follow-up: the fast-forward is pinned by tests that run it against real clones,
though no pull has been run from a packaged build yet. If git refuses, its own
message comes back in the checkout panel.

### [#1416] The first-run checklist matches the app it opens beside

The setup checklist used to open at "0 of 7 steps done" with "Connect a
workspace" unticked, next to a header naming the workspace you had just created.
It now counts what the app already has the moment it opens, so a workspace, a
code host, a connected tool, a session, an agent and a plan tick as soon as they
exist, and a step that has ticked stays ticked even if you later delete the
thing that earned it.

The wizard's progress dots mark where you are, distinct from what is done and
what is still ahead, one dot per screen you will actually see and no fraction
anywhere. Two of those screens, the tools step and the Sentry step, count toward
the same checklist entry, so connecting any one tool ticks both.

### [#1418] Archive and delete move to the session header

Archive, unarchive and delete used to sit at the bottom of the session rail
behind their own inline confirm and a single flat warning. They now live in a
Session actions menu in the session header, beside the editor and git actions,
and they route through the same confirm the keyboard shortcuts use, whose
warning differs for a session with a branch and one without. Two clicks to
confirm and Escape to dismiss, both unchanged.

A failed archive or delete reports inside the confirm now instead of as a toast.

### [#1422] Connect Slack while setting up

The first-run tools step offers Slack beside Linear and Jira, and connecting it
completes the setup step the same way a tracker does. That step is now called
Connect your tools, since it no longer covers trackers alone.

A connect that failed partway used to leave a Slack token in your keychain that
no screen in the app could remove. A failed connect now leaves nothing behind in
the keychain and puts the previous connection's record back, so you can
reconnect or disconnect it.

### Smaller fixes

- A run paused by the session budget offered two controls that opened the same
  budget screen, and now offers one [#1417]
- The first-run screens with no workspace to show use the same empty state as
  the rest of the app [#1420]
- Push and rebase are offered only when Goodboy knows how far ahead or behind
  the branch is [#1419]
- A remote address carrying a token no longer appears in git error text [#1419]
- `docs/concepts.md` and `docs/traps.md` now match the app that shipped [#1421]

## Goodboy v0.1.81

Goodboy reaches the board without waiting on provider detection, and the
failures that used to take the window down now leave a screen with a next step
on it.

### [#1405] The board appears without waiting on provider detection

Launch used to wait on provider detection before the board appeared, and that
cost between one and seven and a half seconds a launch. It is off the boot path
now, so the board comes up first and detection catches up behind it. A provider
Goodboy has not checked yet counts as not connected everywhere that matters, so
nothing runs on a guess.

The launch log at `~/.goodboy/boot-breadcrumbs.log` records each phase against
its own time. A log written by v0.1.80 or earlier reads shifted by one line.

### [#1407] A failure keeps the window up and shows the next step

The crash screen leads with Try again, wraps the error instead of clipping it,
and offers Report, which opens a prefilled GitHub issue in your browser carrying
the error, the app version, and where in the app it broke, with home folders
shortened to `~` on the crash screen, though the boot error screen's own report
link does not shorten them yet. That text reaches GitHub as the page loads, and
it becomes an issue only once you submit the form there. `README.md` and
`SECURITY.md` now count the crash report alongside the boot log and the update
check.

A database Goodboy cannot open used to end the process before any window
appeared. The window now opens on a recovery screen that names
`~/.goodboy/data.db` and tells you to move that file aside, so the next launch
creates a fresh one.

Follow-up: creating a GitHub repository runs through GitHub's own CLI, and no
call has gone out to a live account yet. If a response differs, the error comes
back on the screen with your input still in it.

### Fixes

- An agent row with a kind Goodboy does not recognise shows that value instead
  of taking the window down [#1407]
- The Diff lens no longer prints `0 files` above the banner saying it could not
  read the repository [#1407]
- Creating a GitHub repository checks the name and the visibility it got back
  against the ones you asked for, and a repository left behind by a later
  failure is named with its URL [#1407]
- Settings counts storage in the app's own language instead of the operating
  system's [#1407]
- The app icon carries the accent colour the app uses and the favicon the one
  the site uses, instead of a teal neither of them has [#1406]

## Goodboy v0.1.80

Goodboy opens. Every launch reaches a painted window, a folder without a git
repository is now a folder you can work in, and a lens that has not loaded shows
a skeleton instead of a zero.

### [#1397] The window paints on every launch

Five of seven launches used to show a window with a title bar and nothing in it,
and the splash never appeared even though it was wired to every boot phase. The
cause was not a slow bundle. Every database call the boot makes ran on the macOS
UI thread, so a slow query parked the thread that paints.

Those calls now run off it. The window declares its own background colour and
stays hidden until Rust shows it, so the first thing you see is Goodboy's
charcoal rather than a black rectangle, and the window appears whether or not the
web view ever runs.

When a phase takes longer than usual the splash says so and offers to restart.
If the boot fails outright, the error screen offers a retry that genuinely re-runs
it. Every launch also appends its phases and their timings to
`~/.goodboy/boot-breadcrumbs.log`, owner-only, phase and timing only, no paths and
no credentials, so a boot you cannot reproduce is still a boot you can report.

### [#1401] Create or link a repository when a folder has no git

Opening a folder without a git repository used to leave you with instructions and
no sessions. That folder is now a workspace you can use as it is, with a way to
link a code host whenever you want one. Create a new GitHub repository from inside
the app, pick public or private yourself with nothing preselected, and the app
tells you exactly what it is about to make before it makes it. Declining costs
nothing and the offer stays.

Follow-up: repository creation goes through the `gh` CLI and its flags come from
gh's published surface, though no create has gone out to a live GitHub account
yet. If a call is refused, gh's own message comes back in the dialog and the
folder stays usable.

### [#1402] A lens shows a skeleton until it has loaded

A lens with no rows and a lens that had not loaded looked identical, so an empty
state could be a claim the app had no evidence for. Collections that have not
loaded now show a skeleton, and an empty state means the app looked and found
nothing.

### Fixes

- Status dots in the session rail carry labels for screen readers [#1402]
- The README no longer describes screens that are not there, and says what the
  website measures and what the app does not [#1399]
- Shipped database migrations are guarded against edits after release [#1395]

## Goodboy v0.1.79

The resolver becomes a dashboard, a run gets a spending limit you set yourself, and two counts that disagreed about your session become one.

### [#1386] Every resolver thread offers a next action

Resolver detail opens on a dashboard instead of a transcript: a run recap card on top, a lead and contextual actions per thread, and the transcript demoted to a tab.

Every thread state now offers a next action. Hints can be attached to the fix-anyway and rework actions rather than only to redo, and every lock, whether the agent is queued, running or resolved, or the thread is batched or busy, runs through one gate. A locked action shows as a disabled button with the reason. Before this, a busy or locked thread could offer nothing at all.

Run summaries go through a single codec. The orchestrator emits its done and remaining counts as JSON, and the desktop summary falls back to the older markdown when the shared parser returns nothing.

### [#1382] Set what a run is allowed to spend

A run's step ceiling was a fixed number in the code. It is now a spending limit in dollars that you set per run, from a popover on the run's meta row, in the orchestrator panel and in the workflow creation form, and you choose whether hitting it notifies you or pauses the run. The fixed ceiling is gone with it, and the limit defaults to unlimited, so a dynamic run has no automatic stop until you set one.

The orchestrator sizes its own step count from the goal and the process rather than against a fixed ceiling, and consolidates the work that is left as it approaches the limit.

### [#1390] One count of active resolvers feeds the overview and the sidebar

The session overview counted five different things and called the total comments to resolve, while the Resolve row in the sidebar counted something else. The two numbers came from separate code and could disagree, so the overview could say nothing needs you while the sidebar showed work.

Both now read one count of active resolvers: the overview says `N active resolvers` rather than describing them as comments, queued replies not yet pushed get their own line, `N resolutions ready to push`, and the Resolve row keeps a dot when something is queued but nothing is active. Pull request comments with no resolver behind them no longer inflate that count, and an unanswered comment that blocks a review still surfaces, through the pull request lens where it lives.

### [#1389] Impact Studio starts recording shipped pull requests

Nothing ever wrote the pull request cache, so the shipped pull requests panel in Impact Studio has been empty for every user since the table was added. Refreshing a session's pull request now writes to it.

Sessions record which repository they belong to, so two repositories in one workspace that share a branch name no longer have each other's pull requests and spend counted against them, and only the number, title, url, state and update time are stored, never the description. Rows are written when a pull request refreshes, so the panel fills from the first sweep after updating rather than from the archive. The paired phone still matches on branch alone, which can still misattribute a pull request when two repositories share one.

### [#1388] A failed commit surfaces as a visible error on the turn

An agent's `git commit` fails when an editor is holding the repository's index lock, and that failure arrived as text buried in the transcript. It now surfaces as a visible error on the turn, with the cause named and the turn marked retryable, for every provider that reports tool failures back to Goodboy. Gemini does not report them, so a commit blocked this way still passes quietly there.

### Fixes

- Dynamic workflow runs no longer show a "Step X of Y" subtitle, which counted against a total that does not exist for runs whose steps are spawned as they go. They show the number of steps actually spawned [#1382].
- A run stopped by its budget always surfaces the stop message, and says it in neutral wording rather than session-level copy [#1382].
- Duplicate desktop components were folded into the shared component package: the card and ghost action buttons, the icon-only copy button and its link hook, and the issue state badge, which is now the shared chip. Four hand-rolled dropdown backdrops in the Jira assignee picker, the transition menu, the pull request verdict action and the pull request switcher now go through the shared dropdown, the switcher and reviewer picker drop their re-implemented popovers, and the layering values behind floating surfaces became named tokens [#1381].
- The session overview uses the shared pane frame, two duplicated icon entries in the next-up card now come from the shared concept map, and the confirmation pill moved next to its only caller. Nothing moves on screen [#1391].
- The migration test suite stopped rebuilding a database for every intermediate version, which took six seconds and grew with every release shipped. It samples instead, still rejects a duplicate version, a gap and a filename that disagrees with its number, and gives up one detection route that started from a mid-history version [#1392].

## Goodboy v0.1.78

One sidebar for every surface, and chrome that stays where you left it.

### [#1379] One sidebar carries navigation on the board and inside a session

The left rail and the session sidebar were two columns, each with its own
header, its own controls and its own idea of where you were. Moving between the
board and a session swapped one for the other, so the workspace name, the
switcher and the hide control changed place under the cursor.

There is now a single sidebar across the board, a session, the collapsed rail
and the peek that opens when you hover that rail. It opens with the workspace
identity, the switcher and Preferences, then Board, then the session title when
a lens is open. The breadcrumb sits in the page above the lens instead of in the
top bar, and the top bar keeps the workspace identity on the board only, so the
switcher shortcut always resolves to one popover.

Integration lenses read with the tool name their sidebar row uses,
`Overview > GitHub > PR #12` rather than a generic pull request crumb, with
GitLab, Jira, Linear, Sentry and Slack at the same depth. A list view no longer
shows a crumb for an item you have not opened.

### [#1379] A workflow run carries a recap of what it has landed

Reading what a run had done meant opening its steps one by one. The
orchestrator now writes a short recap with every decision, what the run has
landed and what is still open, and the run detail shows it under the steps. It
belongs to the run you are looking at, not to the workflow, and it is rewritten
on each decision through to done or blocked.

### Fixes

- The workspace switcher opened two popovers at once when the sidebar was
  collapsed or peeking, because each state mounted its own listener [#1379]
- An orchestrator decision that never closed its marker swallowed the recap
  that followed it; the search for the decision's end now stops at the recap
  [#1379]
- Autorun, stop and retry appeared twice on an orchestrated run, once in the
  chat and once in the orchestrator panel that owns them; the chat now shows
  the next step only [#1379]

## Goodboy v0.1.77

Controls you can reach, and a board that does not claim what it has not checked.

### [#1358] Reach every sidebar control with more than one project mounted

With two or more project mounts, the sidebar's Open, Branch, Archive and Delete
controls were pushed past the sidebar's edge and could not be clicked at all.
The switcher grew a tab per mount inside a row that neither wrapped nor
scrolled, so the controls went off-surface at any sidebar width.

That row now scrolls horizontally, with a fade at each edge when there is more
to reach. With a single mount it looks exactly as it did.

### [#1363] An unfetched pull request reads as checking, not missing

At launch the board placed every session it had not yet asked GitHub about as
though the answer were already in, then moved cards between columns one at a
time as the real answers arrived. Nothing was missing from that first board;
what was on it was labelled wrong.

A session whose pull request state has not arrived now says so, in place, with
the chip slot showing it is still checking. A session GitHub could not be
reached for shows a quiet offline marker and is retried. A session that has
been checked and genuinely has no pull request reads exactly as before, and a
running agent, an error or an open question still outrank all of it.

A `gh` call that never returns no longer freezes a card for the rest of the
session: those calls now give up after a minute and the card retries instead
of waiting forever.

### [#1365] A stop mid-decision reads as stopping until it lands

Stopping a run while the orchestrator was choosing its next step showed
Stopped on the rail card and the collapsed row for as long as the decision ran,
which is the surface the stop button sits on. Those surfaces now say stopping
until the decision ends.

A stop is also no longer overwritten when the decision in flight fails or comes
back unreadable: the run stays stopped by you rather than reporting a failure
you did not cause.

### [#1366] Images in a pull request body load when you ask

An image in a pull request or merge request body showed as broken. It now
renders as a placeholder naming the host it would come from, and loads only
when you click it, one image at a time. Nothing is fetched before that click,
because loading a remote image tells whoever hosts it that you opened the page.

This covers every body the app renders that way, including GitLab merge
requests, Bitbucket pull requests and Slack threads.

### [#1362] Autorun reads as autorun everywhere

Three surfaces called it "auto" and coloured it as an error: the session
overview lane, the board card and the activity bar. All three now say Autorun
in the same tone as the toggle, and the in-app guide's colour legend matches.

Delete on a session card now sits behind a divider instead of directly beside
Archive.

### [#1364] "Nothing needs you" no longer appears while resolvers are running

The session overview could show "Nothing needs you right now" above a rail
counting live resolve work, because the two counted different things. A
resolver started without a source comment now counts on both.

### [#1361] Two removals on the security perimeter

Two Tauri commands were removed: one could return any credential from the
keychain to the interface, the other reported whether one existed. Neither
had a caller. The webview's standing
permission to reach Linear's API has been removed too: those calls are all made
outside the interface.

Follow-up: every fix above is pinned by its own test, and none of them has been walked
in the built app yet. If one behaves differently from what is written here, that
difference is new, and worth reporting.

## Goodboy v0.1.76

v0.1.75 gave a hands-free run a stop. This one puts it in the pane you are already watching, not only in the sidebar.

### [#1349] Stop a hands-free run from the chat header

The stop existed, on the workflow row in the sidebar and on the workflow detail. The chat header, the one you actually read while an agent works, offered nothing at all during a hands-free run.

It now carries the autorun state and the stop, in the slot the manual advance button used to sit in. The same control the workflow detail already carried, same label, same confirm.

After a stop the control stays put and becomes the way back: a static run resumes from the same click, and a run the orchestrator is driving gets a Resume beside it. You are not sent back to a sidebar you had already navigated away from.

Follow-up: the stop and the resume write the same operator record and read the same phase derivation the sidebar control and the orchestrator panel have used since v0.1.75, though no live orchestrated run has driven them from the chat header yet. If the decision already in flight lands after your stop, the stop holds and nothing advances.

### [#1346] A run stopped mid-decision reads as stopping

Stop a run while the orchestrator is choosing the next step and the panel kept reading "Choosing the next step" until that choice landed, which its own timeout bounds at two minutes. It now reads as stopping, and waits.

It does not read as stopped. The decision has not come back, and the run is not stopped until it does.

### [#1350] Draft comments are readable in the dark theme

The draft-comment badges on the board and in the diff, and the review-requested badge beside them, used a fixed indigo that lands at 2.54 to 1 against the dark background, under the contrast floor at any size. They now use a theme-aware tone that clears it in both themes.

### [#1351] Disconnecting an integration asks first

The Disconnect button inside an integration's form removed the token and the connection the moment you clicked it. It now asks, the way the button in the studio header already did. Each integration keeps its own description of what disconnecting does, which is not the same for all of them.

### Fixes

- The stage reason on a session's overview adds the stage it belongs to, instead of a tooltip repeating the line already in front of you [#1351]
- The autorun toggle on the workflow detail says whether it is on or off, instead of reading "Autorun" either way [#1351]
- Deleting a single session asks "Delete 1 session?" instead of "Delete 1 sessions?" [#1352]
- The workflow builder, the cluster notice and the step notice all call the hands-free mode Autorun. The session overview still labels it `auto` [#1352]
- The Slack setup text now says that connecting also reads your workspace's member list, and describes the token check and where the token is kept in the order they actually happen [#1352]
- A provider Goodboy supports now reaches every list that offers one: chat, routing, budgets, onboarding and the phone companion [#1347]
- The session view menu keeps its place near the screen edge, flipping upward when there is no room below [#1348]

## Goodboy v0.1.75

Turning autorun off now stops the step in flight, raw output standing in for a summary is labeled as such, and controls that only showed on hover now show on keyboard focus.

### [#1339] Stop an orchestrated run, then resume it

The autorun toggle sits on the workflow's row, in the sidebar and on the workflow detail. Turning it off while a step is still running now asks first: "Stop this run?" Confirm, and the turn is canceled, the step in flight is marked skipped, and everything it already wrote is kept. Turning autorun off when nothing is running is unchanged, with no confirm and no extra write.

A run you stopped reads as stopped rather than "Orchestrator failed", both in the orchestrator panel and in the sidebar. Resume clears the stop, turns autorun back on and asks for the next step, rather than advancing one step and stopping again.

A stop you send while the orchestrator is choosing the next step is no longer erased when that choice lands.

Follow-up: a stop sent while a decision is in flight is honored, though the panel keeps reading "Choosing the next step" until the model returns, which can take a couple of minutes. Nothing advances in the meantime.

### [#1337] Steps that could not be summarized are flagged everywhere

When a step's output cannot be summarized, Goodboy shows the raw truncated output in its place. Sequential steps already labeled that substitution and put a notification in the inbox with a retry action. Steps inside a cluster, a scout's branches, and parallel steps made the same substitution silently. All four now behave the same way, one notification per agent, so raw output is labeled as raw output rather than passing for a summary.

### [#1340] Hover-only controls stay visible under keyboard focus

The remove and delete buttons on chat attachments, goal attachments and provider credentials only appeared on hover. They were always in the tab order, so a keyboard user could land on an invisible control and press it. They now appear on focus, as does the copy affordance on an assistant message.

### Fixes

- Counts read "1 agent", "1 session" and "1 folder", not "1 agents" [#1341]
- The pull request pane calls linked work "Linked work" and "Completed linked work", one name where it used to carry two [#1341]
- The routing status chip reads in sentence case rather than all caps, and its label and its screen-reader label now match [#1341]
- The permission, issue, reviewer and resolver menus close on Escape and flip upward when there is no room below them [#1338]
- The stage reason and the edit-branch control on the session overview use Goodboy's own tooltip, not the browser's [#1340]
- A provider added without a routing priority is caught before it ships, rather than dropping out of the priority list unnoticed [#1343]

## Goodboy v0.1.74

Review threads carry GitHub's outdated mark, the note you send the orchestrator is kept with its decision, and a failed comment push names what broke.

### [#1330] See what you told the orchestrator

The note you type into "Not done? Say what is missing" now stays with the decision it triggered. It used to be sent to the model for that one call and then cleared, so afterwards there was no way to read back what you had asked for.

It shows up on the orchestrator's decision card in the transcript: a "your note" chip on the card head, and the note in full under its own label when you open the card, above the orchestrator's own text so the two never read as one voice. Terminal decisions carry it too, so a `done` or `blocked` verdict shows what it was answering.

Standing hints are unchanged. They persist by design, are read before every step the orchestrator decides, and have their own Clear hints control.

### [#1328] Outdated review threads carry a mark

GitHub marks a review thread whose code a later commit superseded. Goodboy fetched that fact and dropped it. Now the thread head carries an "Outdated" mark in the pull request conversation and on the resolve board, so you can tell a live comment from a stale one before you spend a resolver agent on it. Outdated threads are not hidden or collapsed and stay selected when you resolve all, so the mark tells you what to skip rather than skipping it for you.

Follow-up: the mark reads the outdated flag GitHub already returns on a review thread, though no live pull request carrying one has been opened in the app yet. If the flag is absent, the mark is too and the thread reads as it did before.

### [#1331] A failed comment push carries its stage and a retry

Pushing a batch of resolve verdicts could fail while reading or refreshing the queue, and the only trace was a generic "an action failed in the background" row with no session link and no way back. Those failures now name the stage, say what is still queued, and link to the session. The Retry re-runs the push, which skips any reply already posted.

Follow-up: the guards sit on the queue read, though no real database failure has hit them yet. If one takes a different shape, it still reaches the notification inbox through the global failure notice.

### Fixes

- The diff viewer and the review board dead-ended on a load error. Both now show the error with a retry in place [#1329]
- Hover-only actions on the file tree, the review lines and the diff comment rows are revealed by keyboard focus too [#1329]
- Resolver verdict and status chips read in sentence case instead of all caps [#1329]
- The reduced-motion gate on the spinning border, the pulsing border and the attention ring is pinned by a test [#1329]

## Goodboy v0.1.73

A workspace no longer needs a repository to exist first, and a failed integration list is no longer a dead end.

### [#1325] Start a workspace without a repository, then link one

Goodboy could already run a workspace with no git behind it, as plain folders, but only for people who said they do not write code. It is now offered on the developer path too, so you can start on a goal before the repository exists.

The onboarding step says what the choice costs while you are making it: plain folders, no branch, no diff and no pull requests until you link a code host. Linking one later is the control that already sits in the footer, and from that point new sessions get their own branch and worktree.

Sessions you created before linking keep working as plain folders. They are also no longer mistaken for branch-backed sessions afterwards, which is what used to let a push or a pull request start against a branch that was never there.

### [#1321] A failed integration inbox offers its retry

Open a studio, have a token expire or a request drop, and the list collapsed to a red box with the error text and nothing to click. In GitLab, GitHub and Bitbucket there was no way to try again without closing the studio and opening it again.

The retry now sits in the error itself, in all five studio inboxes and on a Linear task opened inside a session. Jira and Slack already kept a working refresh in their header; they get the same in-place control.

### [#1323] A workflow step hands over the summary it produced

A workflow step passes its output to the next one through a short summary. When that summary ran past the size the handoff allows, the whole thing was discarded and replaced with a raw head-and-tail cut of the full output, which is longer and less useful than the summary it replaced.

The summary is now trimmed to the last whole line that fits, so nothing is cut mid-line, and it says so: it ends by naming the trim and pointing at the full step output. An empty summary is still treated as a failure, because there is nothing there to keep. The "degraded handoff" marker in the transcript used to guess by matching the shape of the discarded text and could not recognise a short output at all, so within the session it now appears when the handoff actually degraded and stays away when it did not. After a restart it goes back to reading the summary's shape.

Follow-up: this stands on the mechanism, not on a count of how often the old path fired. If a summary still cannot be produced, the handoff degrades as before and the notification keeps its retry.

### [#1326] The merge request form keeps its submit button in view

Opening a GitLab merge request from Goodboy put the Create button inside the scrolling form, so expanding the agent options pushed it off screen. It is now pinned below the form the way the pull request equivalent already was.

### Smaller fixes

- A busy button shows a pulsing dot instead of a spinner [#1324]
- Two animated styles in the app now stop entirely when the system asks for reduced motion [#1324]
- The new-script form drops the box drawn around it, matching every other create surface in the app [#1326]
- The budget cap editor separates its threshold section with a divider instead of a border [#1326]
- The integrations menu in the footer scrolls with a fade instead of a hard cut [#1326]
- The cost colors block in the guide no longer sits with more space above it than its neighbors [#1326]

## Goodboy v0.1.72

The release now carries Linux packages, credentials there go to the system keyring, and the shortcuts answer to Ctrl.

### [#1316] Download Goodboy for Linux as an AppImage, deb or rpm

Until now a tagged build produced one thing, a macOS universal `.dmg`. The same tag now also builds on Linux and attaches three x86_64 packages to the same release: an AppImage, a `.deb` and an `.rpm`, needing glibc 2.39 or newer, so Ubuntu 24.04 and Debian 13 upward.

The `.deb` and the `.rpm` declare what they link against, read out of the binary with `dpkg-shlibdeps` rather than written by hand, so your package manager resolves the GTK and WebKit stack for you. The AppImage carries its own and needs FUSE 2 on the machine, which recent Ubuntu does not install by default (`sudo apt install libfuse2`, or run it with `--appimage-extract-and-run`). None of the three is signed, and in-app updates stay macOS-only for now, so on Linux a new version is a new package from the release page.

macOS is untouched: the same universal build, the same Apple signing and notarization, the same four assets, the same Homebrew cask. The Linux leg runs after the macOS one, passes no release body and no updater key, and goes red on its own.

Follow-up: the packages come off a GitHub `ubuntu-latest` runner, built from this tag, though the app has not been launched from one of them on a Linux desktop yet. If your distribution cannot satisfy something the `.deb` or the `.rpm` declares, apt or rpm says which one before anything is written.

### [#1317] Credentials on Linux go to your keyring

Integration tokens and provider credentials live in the operating system's credential store. On Linux that is the freedesktop Secret Service, GNOME Keyring or KWallet, so a keyring daemon has to be running before a token can be saved, and the session negotiates a Diffie-Hellman key so a secret does not cross the session bus in the clear. macOS keeps the Keychain exactly as before.

Follow-up: the backend is the one the `keyring` crate selects on Linux, checked by compiling the dependency graph for each platform, though no token has been stored and read back on a Linux desktop yet. With no daemon running, saving fails with the keyring's own error and the token is not saved.

### [#1318] Shortcuts use Ctrl on Linux

Every shortcut asked for Command, which a Linux keyboard labels Super and the desktop environment mostly keeps for itself, so none of them fired. They resolve to Ctrl off macOS now, and the shortcuts screen and every hover hint show the combination you press. macOS bindings are unchanged.

One exception, and it is GNOME's rather than ours: the terminal lens sits on Ctrl+Alt+T, which GNOME takes for its own terminal, so there the shortcuts screen lists a combination that will not open it. Open that lens from the session's lens list instead.

## Goodboy v0.1.71

The window comes up while Goodboy looks for your CLIs instead of after, and a phone can now start a session from a Jira issue.

### [#1314] The window opens before Goodboy has found your CLIs

Launching Goodboy used to mean an empty desktop while it worked out which provider CLIs you have. On a machine with all five installed that was about 2.4 seconds of nothing on screen, most of it the login shell Goodboy runs to resolve your `PATH`.

That work now happens in the background, once the window exists, and the five checks run together rather than one after another, which takes them from about 2.0 seconds to about 1.35 seconds. What you see is unchanged: the splash still names the phase it is in, and the provider list still arrives filled in.

Follow-up: the window's place in the order comes from Tauri's own startup, which builds the window before the app's setup hook runs, and the work that moved was measured where it used to sit, though the app has not been launched from a packaged build with the change in it. If a CLI stalls, the window is already up and only the provider list waits.

### [#1312] Start a session from a Jira issue on your phone

The mobile companion could browse issues and start a session from Linear, Sentry and GitLab, but not Jira, so a team running on Jira had nothing to open. Jira now sits with the other three: its issues reach the phone, and a session starts from one with the goal already written. Every check that guards a Linear issue guards a Jira one identically.

Asking the companion for a provider it does not support used to be answered with every issue from every connected provider instead, with no sign the request had been changed. It now refuses by name. GitHub, Slack and Bitbucket stay out on purpose: a GitHub session starts from a pull request, Slack threads are not issues, and Bitbucket has no issue tracking because Atlassian points that at Jira.

Follow-up: the Jira calls reuse the client the desktop issue picker already runs, though no call has gone out to a live Jira workspace from a phone yet. If a shape differs, the phone's issue list leaves Jira out rather than showing an error, and a failed session start comes back as a plain refusal with the real error kept on your machine.

### [#1313] The Beta badge carries a support message

The Beta badge in the footer opens a popover now: Goodboy is free and open source, and one action opens GitHub Sponsors in your browser. The badge still reads Beta.

## Goodboy v0.1.70

The session tells you the truth about what it holds, and filing a bug no longer costs you the page you were on.

### [#1309] File an issue from the top bar

A bug control now sits in the top bar, between running scripts and notifications, and opens a popover that takes an issue type and a description right where you hit the problem. Close it and the draft is still there when you come back. Reset empties it, and the trigger carries a dot while a draft is waiting.

The popover's primary action opens the full form on the same draft, which is where the title, the area and the preview live. Settings keeps its entry, the command palette keeps its command, and all three land on that same form. The full form now closes and clears the draft once the report is filed, instead of showing a success state and sitting there with your text still in it, and on the direct path the created issue opens in your browser.

The issue type is a new field rather than a rename of the area, and it reaches GitHub as the first line of the issue body. Screenshots are not part of this: the app has no screen capture of its own, and there is nowhere to put an image that survives GitHub's issue renderer.

Follow-up: the filing path is the one v0.1.69 shipped, with the type line added at the top of the issue body, though no issue has gone out to a live GitHub account since. A failed send keeps the draft.

### [#1308] Read a linked Sentry issue whole in the session

A Sentry issue linked to a session showed less than the same issue shows in the Sentry studio. The session pane never fetched the issue at all, only its latest event, so the culprit, the level and the status were blank by construction.

The session pane now reads the issue itself and lists level, culprit, status, events, users, first seen and last seen. Those last four had no path to the screen anywhere in the app before this. Loading is a skeleton and a failure is a retryable error strip.

Follow-up: the issue endpoint and its response come from the same Sentry shape the issue list already reads, though no call has gone out to a live Sentry workspace yet. If a field differs, the pane shows a retryable error rather than a blank one that could pass for data.

### [#1306] Link a GitHub issue to a session by hand

A GitHub issue could only reach a session by accident, through a pull request that happened to say "Closes #N". The link menu offered Linear, Sentry, GitLab, Jira and Slack but not GitHub, and the empty state asked you to link a GitHub issue while giving you no way to do it.

GitHub now sits in the link menu with the others, and the empty state carries the action it was asking for. A hand-linked issue is stored the way every other linked issue is stored, so it survives the next pull request refresh.

### Fixes

- A workflow attaching in the background no longer pulls you out of the lens you are reading, and the new run is still focused for when you open the workflows lens yourself [#1305]
- A workflow run now waits for the session summarizer, up to a minute, before reporting done, instead of flipping to complete and then being summarized again [#1304]
- Picking a model from a different provider in an orchestrator routing row or a library step form now saves the pair you picked, though a pair saved wrong before this release stays as it is [#1307]

## Goodboy v0.1.69

When something fails, Goodboy stops leaving you stuck: your message survives a spent budget, a stalled workflow says so where you can see it, and a saved setting stops disappearing.

### [#1292] Send anyway when every budget cap is spent

With every connected provider over its cap, sending did nothing you could recover from. The composer cleared itself before the send ran, the turn was refused, and the message you typed was gone from the composer, the draft and the database alike. The button that offered a way out called the same path that had already refused it, so it did nothing at all.

Your text and its attachments now come back when a send is blocked. A line above the composer says every provider is over its cap and offers Send anyway, which runs that one turn on your preferred provider even though it is over. The attachments of a message that was never sent were also being deleted from disk on the way out; they are kept now.

The same line now shows for the ordinary case too, naming where the next turn is about to go and why when a budget or a disconnected provider moves it. It appears only when routing actually moves or is blocked, and it clears itself the moment that changes.

Follow-up: the forced turn is covered by tests against mocked budget results, and no over-cap turn has yet reached a spawned CLI process.

### [#1294] Pick the fallback model for each agent role

A turn already retried somewhere else when a provider failed, but the choice was a heuristic you could not see or influence. For an authentication failure it was literally the first other connected provider you had.

Agent roles in the providers studio now take a second, optional model under each pinned role: where that role goes first when its primary choice fails. Left alone it reads Automatic and the existing heuristic runs exactly as before, so nothing changes until you set one.

The fallback carries no effort of its own and inherits the one you chose for the role. It applies to agent roles; the task models beside them keep picking automatically. It is set per workspace, not per session. A fallback pointing at a provider you have since disconnected, or at a model the catalogue does not know, is dropped and the heuristic runs instead: it never fails the turn, and it never drags the pinned model down with it.

Follow-up: the routing was exercised against mocked provider failures, so a fallback has not yet moved a turn between two live CLIs.

### [#1293] Report an issue without leaving the app

Filing a bug meant leaving for a browser. Settings now has Report an issue, also reachable from the command palette. It carries the version you are running, an area, a title and your notes, then shows a read-only preview of exactly what will be sent before you send it.

With the GitHub CLI or a token that reaches the repo, it files the issue and hands back the link. Without either, it opens GitHub's own new-issue page with the fields already filled in, rather than asking you to sign in to something new.

Only four things go in: the version, the area, the title and your notes. Nothing else is read from the app, no logs, no session data, no paths. The issue posts publicly under your own GitHub account, and the form says so above the button.

The list of areas is our own choice rather than a settled taxonomy, and it will change as the app does. Screenshots are not supported: a GitHub issue body is markdown text and there is no attachment path that survives it, so the form points you at dragging one onto the issue once it opens.

Follow-up: no issue has been filed from this path against a live GitHub account, so the shape of what the CLI prints back is read defensively rather than assumed.

### [#1291] See a blocked workflow step from the board

A workflow run stuck on a failed step was invisible everywhere except the workflow pane. The board card's action quietly disappeared, the pipeline lane said nothing, and a hands-free run stopped without a word, because the code behind those surfaces could not tell "blocked" apart from "nothing left to do".

The pipeline lane now reads Blocked at the step that failed, the board card offers Skip blocked step with a confirm, and a hands-free run that stops says so once, naming the step. The failed step still shows when an open question or a running summarizer is holding the run as well, so the board, the overview and the workflow pane agree on what happened.

### [#1295] Keep the provider you picked in a routing row

Switching provider inside a routing row's picker could throw the switch away and take the row with it. Picking a new provider fired two updates in one click, the second of them still holding the old provider, and the mismatched pair was refused and the whole saved override for that role deleted. On a role that had gained a fallback, the fallback went too.

Both routing rows now commit the provider you actually picked. A pair the registry refuses is repaired to the model's real owner rather than clearing the row, so a refusal is never answered by deleting what you saved. This also covers connecting a provider from inside the open picker, where the row could not otherwise know which provider the model belonged to.

## Goodboy v0.1.68

A budget cap now moves work before it is spent, and the cost figures stop claiming to know things they never measured.

### [#1287] Divert work at the budget threshold you set

A provider cap used to sit idle until spending passed 100% of it, and then block the turn outright. The threshold you already set for alerts now also moves work: past it, the next turn prefers another connected provider; over the cap, that provider is excluded as before.

The move is no longer silent. A turn that lands somewhere else for a budget reason writes a line into the transcript naming where it went and why, the way a provider error already did. Both cases were silent until now.

The threshold sits next to the cap in the budget studio, and it is one number doing two jobs: it raises the alert, and it moves the next turn. Spend past it still runs on the same provider when no other one has room, so nothing that used to run now blocks. Session soft caps have no threshold of their own and are unchanged.

Follow-up: the routing path ran against in-memory SQLite and mocked budget results, so no turn has yet moved between two live CLIs on a real monthly total.

### [#1288, #1289] See which spend was measured and which was estimated

Goodboy priced every turn with equal confidence, including the ones it had no price for. An OpenCode, OpenRouter or Moonshot turn is billed at whatever the CLI reports, or at nothing when it reports nothing, and that zero went into your spend total as fact.

The budget studio now marks each model row: `unpriced` when Goodboy holds no rate for that model and the run recorded nothing, `approx` when the figure comes from an estimated rate rather than a billed amount, and no mark at all when the price is real. Where turns went uncounted, the provider says so above its cap control, because a cap can only add up the spend it has.

An unknown Cursor model also used to be priced at the cheapest rate in the table, understating an unrecognised Opus run by roughly ten times. It now takes the most expensive rate, so a cap errs toward protecting your money instead of spending it.

### [#1285] Read what the work you shipped cost

Impact Studio reported what shipped and how long it took, with no money anywhere. It now carries a spend total for the window, the sessions that cost the most, and a figure on each merged pull request, so the run worth looking at is visible without opening a diff.

Spend attributed to a pull request is the spend of the sessions on its branch, not a per-commit measurement, and a session with nothing recorded reads as absent rather than as zero.

### [#1286] Resolve a merge request thread from the review card

A GitLab review thread could be read and replied to inside Goodboy, and then you opened the browser to tick resolve. The thread card now carries the action itself, in both directions, and the card reconciles against GitLab after every write so a refusal cannot leave it showing a state the server never accepted.

Follow-up: the endpoint and its parameters come from GitLab's published REST documentation, though no call has gone out to a live GitLab instance yet. If a shape differs, GitLab's own error comes back on the card with the thread untouched.

## Goodboy v0.1.67

The footer and the top bar were reorganised, and a workspace can now hold more than one code host.

### [#1277] Connect integrations from grouped footer controls

Seven integration buttons had grown to fill half the footer, in one undifferentiated row, each carrying a text label whether or not you used it. They are now three groups, split by a divider: code hosts (GitHub, GitLab, Bitbucket), trackers (Linear, Jira, Sentry), and conversation tools (Slack).

A group shows only what you have connected, as a glyph, and ends with an add control. Opening that control lists every integration of that kind with its connection state, so the ones you have not turned on are one click away instead of taking a permanent slot. A group with nothing connected labels its add control with what it offers, so a first run reads "Code host" rather than three anonymous glyphs.

In a workspace with no repository the code-host group gives way to the same "Add a repo" action as before, and Sentry drops out of the trackers.

### [#1282] Reach settings, updates and the changelog from the footer

The top bar now reports only what is happening: what needs you, what is running, today's spend, notifications, and the theme. Settings and the update control moved down to the footer, which is where destinations live. Budget, Impact and the changelog moved behind one More control beside them.

That More control carries a dot when the notes for the version you are running have not been opened, and clears it once the changelog is open with those notes actually loaded. Offline, or while the fetch is still in flight, the dot stays put rather than being spent on an error screen. Today's spend still sits in the top bar and still opens the budget studio in one click.

### [#1278] Use GitHub for code and GitLab for tickets

Connecting GitHub used to block GitLab, and connecting GitLab used to block GitHub. Both restrictions are gone, and so is the deeper one behind them: GitHub counted as connected only when the workspace's git remote was GitHub, so a valid token reported itself as absent and GitHub disappeared from the new-session issue picker on any other repository.

A workspace can now hold any mix of the three code hosts. Six connect forms also stopped claiming your token "never leaves this machine", which was never true for a token the vendor has to receive: they now say it is stored in your keychain, sent to the vendor over HTTPS, and never touches Goodboy's own servers.

Follow-up: a mixed-host workspace was exercised through the test suite, not against live GitLab or Bitbucket accounts.

### [#1279] Disconnect an integration from its studio

The disconnect button lived inside the connect form, and the connect form unmounts the moment you connect, so from the studio there was no way back out. For Slack there was no way out anywhere in the app.

Every integration studio now carries a disconnect in its header, behind a confirm, and it clears the credential from your keychain along with the workspace's record of it. For GitHub it removes this workspace's token and says so, and it never touches a system `gh` login, so it does not appear when that login is all you have.

### [#1281] Read what went wrong when a token is refused

Pasting a bad GitHub token used to print the `gh` command's own error output into the onboarding step. It now says which of six things happened, and what to do next: the token was rejected, it expired, it is missing the repo scope or an SSO authorization, GitHub is rate limiting it, the certificate could not be verified, or github.com could not be reached. Anything unrecognised still quotes what `gh` said, rather than guessing.

Follow-up: the classification reads `gh`'s wording, so a message GitHub changes could fall through to that quoted fallback instead of a written cause.

### Fixes

- Escape closes the onboarding wizard wherever "Skip setup" is offered, so an accidental reopen is no longer a full-screen dead end [#1281]
- "Connect a provider" is now in the command palette, the one setup step you cannot skip [#1281]
- The onboarding checklist's hide control no longer points at the sidebar for a control that lives in the top bar [#1281]
- The code-host onboarding step no longer says you can only use one at a time [#1278]
- A GitLab failure no longer poisons the pull request panel when the GitHub half succeeded [#1278]
- Review comments resolve to one pull request deterministically, instead of following whichever linked task happened to load first [#1278]
- The empty-provider nudge in the footer now respects reduced-motion settings [#1282]

## Goodboy v0.1.66

Seven hosts are connected. This release makes every one of them reachable from the footer, and makes the states they report honest.

### [#1272] Connect Bitbucket from the footer

Bitbucket shipped whole in v0.1.64 except for the way in. The footer, where a workspace connects an integration, had no entry for it, so unless you had already linked a pull request to a session there was no route to the token field.

It sits with the other code hosts now. Not connected, it opens the same connect panel as everything else. Connected, it opens the repository's pull requests, and Start session works from there. That workspace view is read only: approve, request changes, merge, decline, comment and reply stay inside a session, where they are keyed to its worktree. A composite workspace has no single repository to read outside a session, so it shows an empty state and points you back into one.

### [#1271] Pull requests carry the queued check state

A pull request whose checks were queued or still running reported as passed, so Goodboy could tell you CI was green on a run that had not started. The rollup now calls green only on an affirmative pass, reads anything it does not recognise as pending, and treats action required and startup failure as the failures they are.

Sending a pull request to the merge queue also read as plain open, with Merge still on the button, so a second click looked like the first had not worked. Goodboy now shows the real placement, "In merge queue #3", and auto-merge keeps its own wording.

Follow-up: the queue fields come from GitHub's live schema and the parsing is covered by tests, though no pull request has gone through a populated queue here yet. On a repository with more than 100 open pull requests, one queued outside that window keeps the old behavior.

### [#1273] Comment on a Linear issue from the app

Linear could show you an issue and start a session from it, and write back nothing but the description. Commenting meant opening linear.app, which is the tab this is supposed to remove.

You can now comment on an issue from the studio and the session pane, through the same composer the other hosts use, and the comment Linear returns lands in the thread you are reading. Assign and transition are still missing: both need the team and workflow state ids, which Goodboy does not read from Linear yet.

Follow-up: the mutation and its input come from Linear's published schema, though no call has gone out to a live Linear workspace yet. If a shape differs, Linear's own error comes back in the composer with your draft still in it.

### [#1274] Popovers open above full-page surfaces

Notifications and the workspace selector did nothing visible while an integration studio, a studio page or settings was open: the popover was opening a layer too low, behind the page.

Layering is a named scale now rather than four numbers that happened to agree, so a studio, a popover, the command palette, a tooltip and a toast each know where they stand. The four popovers are wider and taller, and their scroll fade matches the surface it sits on. Workspace settings moved out of the workspace popover onto the workspace row, where settings that apply to every session are visible without opening anything.

### Fixes

- The board control in the collapsed session rail was grey where its expanded twin is tinted, and sat in a shorter box than the Overview row beside it. It now shares both [#1275]
- Clicking the pull request card in a GitHub session did nothing when that card was the pull request already selected, which is the usual case. Clicking it now opens the review studio, and the row says which of the two it will do [#1275]
- Plans put its "consumed" toggle inside the empty state, while workflows, agents and resolve all put it in a row underneath. Plans now matches them, with active plans and without [#1275]

## Goodboy v0.1.65

Slack is the seventh host, and the first conversation Goodboy can hold. Read the thread here, answer it here, and turn it into a session.

### [#1249, #1250, #1261] Slack, from the thread to the session

Goodboy could hold an issue, an alert and a pull request. It could not hold the conversation the work actually started in, so the one place a task is most often born was the one place you still had to go and look. Slack closes that.

Connect a workspace with a bot token from your Slack app. Goodboy checks it against Slack before it stores anything, tells you the five scopes the bot needs, and keeps the token in your operating system keychain. From the app footer, a Slack studio opens on the channels the bot has joined, then the threads inside them, then the whole thread rendered here: avatars, author names, and Slack's own markup translated for reading. Not a preview and not a link out.

What you can do to it: reply in the thread, and react to any message. A reply posts as the connected bot rather than as you, and the line above the box says so before you send. Replies go out as plain text. A control that cannot fire stays where it is and says why.

Where it takes you: Start session from thread opens a session with the goal written out of the conversation and the branch named after it. Pasting a Slack permalink into Link work does the same, and the thread then gets its own lens in the session rail, so the conversation sits beside the diff and the checks instead of behind them.

The limits, stated plainly. Public channels only, and only the ones the bot has been invited to: no private channels, no direct messages. Each channel reads its most recent 200 messages, so an old thread in a busy channel will not appear and there is no load more. The studio reads the first 12 joined channels per refresh and says so under the list when you have more. Outgoing replies are not translated back into Slack's markup. The connection is per workspace, because the company layer this belongs to is not built yet.

The honest part: none of this has run against a real Slack workspace. Every call is contract-tested against fixtures built from Slack's documentation, which proves the requests agree with the docs and proves nothing about the docs. Worst first, `auth.test`, which the whole connect flow rests on, and whether a bot carrying exactly the five scopes Goodboy asks for satisfies every call. Then the shapes of `conversations.list`, `conversations.history` and `conversations.replies`, which every channel row, every thread row and the thread itself are decoded from. Then whether a bot-authored reply actually threads under its parent instead of landing at the top of the channel, which is the riskiest single claim in this release. When a shape does differ, the pane shows Slack's own error name, `missing_scope: channels:history`, instead of an empty list that tells you nothing. Try it, break it, send the error back.

### [#1247] Workflows read newest first, and say when they started

The workflows lane listed runs oldest first while the agents lane and the resolve lane both listed newest first, so the run you just attached was at the bottom of the one lane where you went looking for it. Workflows now matches, using the same comparator the other two already use.

Each card also carries when it was attached, on a scale that degrades as it ages: `5m ago`, `3h ago`, `yesterday`, then `2 aug`, then `12 dec 2025` once the year has turned. It is GitHub's own timestamp behavior, relative while it is fresh and an absolute date once it is not, and `yesterday` is a calendar comparison, so a run from 22:00 still reads as yesterday at 01:00. The same scale replaced the bare dates in the GitHub, GitLab, Jira and Bitbucket inbox rows, where a five minute old item used to read as a plain date with the recency thrown away, and it retired two hand-rolled copies of the same idea under the permissions views.

The column the date comes from already existed and was already being written. It had been left out of the query that reads a workflow run, so nothing could reach it.

### [#1248] The Moonshot mark is the real one

The Moonshot AI provider shipped in v0.1.63 with a stock crescent moon, which is not the company's logo. It is now the vendor's own mark, taken from their published branding files, drawn to match every other provider mark in the app: one shape, one color, legible at 12 pixels. The provider color went with it, from an invented teal to the blue the vendor uses inside the mark itself.

### Fixes

- [#1247] The workflow reorder arrows moved cards the wrong way once the lane was flipped. They now move a card the direction the arrow points, and the boundaries disable at the ends you can see
- [#1247] Reordering workflows restamped every run's creation time to the moment you dragged it. It carries the original through now, which mattered the moment a card started showing it
- [#1247] Auto-run workflows advanced in whatever order the list happened to arrive in. Scheduling no longer follows display order, so several eligible runs still advance oldest first

## Goodboy v0.1.64

Bitbucket is the third code host, and the first one that arrives whole in a single release: read the pull request, review it, vote on it, merge it, and turn it into a session, without a browser tab.

### [#1241, #1243, #1245] Bitbucket, end to end

A Bitbucket pull request used to be a link Goodboy could not read. Now it is an object in the workspace. Connect a Bitbucket Cloud workspace with your account email and an Atlassian API token, and the `pr` lens starts finding the pull request that belongs to your session's branch.

What you see: the pull request in full. Number, state, title, the description as markdown, the source and destination branches, the changed files as a real diff, the build statuses, and the review conversation with each comment's author, age, and the file and line when it is inline. The checks tab opens with a line in plain words, "2 failed, 1 in progress", instead of a row of icons to decode. GitHub's checks tab got that line too.

What you can do to it: approve, revoke your approval, request changes, withdraw that request, comment, reply on a thread, merge, and decline. The vote state reads as a sentence above the buttons, "You approved this pull request. 2 approvals, 1 change request so far". Merge and decline ask before they fire, because they are the only writes here that cannot be undone. A control that cannot fire stays where it is and says why in its tooltip, rather than disappearing.

Where it takes you: Start session on any pull request opens a session with the goal and the branch name seeded from it, and the pull request linked back. Pasting a `bitbucket.org/{workspace}/{repo}/pull-requests/{id}` URL into Link work does the same.

Bitbucket did not get a lens of its own. GitHub and GitLab already share the `pr` lens with a host switcher, so Bitbucket joins them as the third tab, and the tabs only list hosts that actually have something to show.

The limits. Bitbucket Cloud only, no Server or Data Center, which runs a different API. No Bitbucket issues: Atlassian's issue tracker is Jira, and Jira shipped last release. No reopen, because Bitbucket has no reopen verb, so a declined pull request is declined. No merge strategy picker: the merge is sent without one so your repository's own default applies. Goodboy finds Bitbucket work only through the workspace connection, not by reading your git remote. The mobile companion cannot see Bitbucket.

The honest part: none of these calls has run against a real Bitbucket workspace. Every endpoint is contract-tested against fixtures built from Atlassian's documentation, which proves the request shapes agree with the docs and proves nothing about the docs. Two places to watch. The auth scheme is Basic with an Atlassian API token, which is where Atlassian says Bitbucket is heading as it retires app passwords; if a scope still wants an app password instead, every call answers 401, and the error names both schemes so you can tell which one you have. And the change request verb is the least certain path of the six: its hyphenated URL is an assumption, so a workspace on an older API surface could answer 200 without recording the vote, leaving the summary saying you have not voted after a write that reported success. If the pull request list comes back in a shape the docs did not describe, the pane is simply empty and none of the tests will have caught it. Try it, break it, send the error back.

### [#1242] One comment thread, five hosts

Every integration that renders a comment thread had hand-copied the same avatar, header and card. When Jira shipped last release it reused the shared composer and, in the same change, copied the note card and header byte for byte from GitLab. Bitbucket was about to become the sixth copy.

The note is a primitive now. One avatar, one header, one card, one composer, used by GitLab, Jira, Linear, GitHub and Bitbucket, with each host mapping its own fields onto them. Five avatar copies became one, and the three leftover composers were retired onto the one that already shipped. A broken avatar URL now falls back to the author's initial everywhere, which previously only happened on the review surface.

### [#1239] About 1,300 lines of dead code, gone

`GithubCard` and its fourteen files were an entire tabbed pull request view with no consumer: the live path has been a different component for a long time. It survived every cleanup because the repo's unused-file check treats test files as entry points, so its own tests kept it reachable. Five pieces of it were genuinely in use and moved out first, then the rest went.

### Smaller fixes

- [#1240] The GitLab approve button no longer vanishes when the approval state fails to load. It stays where it is, disabled, with the reason in its tooltip, and it now respects whether you are allowed to approve at all
- [#1240] Leaving the plans lens or the GitHub issue lens and coming back shows the list again instead of silently reopening whatever you last had focused
- [#1240] The mobile companion's issue lookups are now checked for completeness by the compiler, so a provider added without its own handling cannot quietly query GitLab instead
- [#1240] The workflow gate message on the session overview comes from the same place as everywhere else, so it cannot drift
- [#1244] A provider union and an exhaustive switch landed in separate pull requests and left the build broken between them, which this closed

## Goodboy v0.1.63

Jira is the fifth host Goodboy reads, and the first one you can assign and transition from without opening a browser tab. Moonshot joins the provider list with Kimi K3, and the Plans lens finally works like every other lens.

### [#1233, #1236, #1237] Jira, end to end

A Jira ticket used to be a URL you pasted somewhere. Now it is an object in the workspace. Connect a Jira Cloud site with your account email and an API token, and the left rail grows a Jira row next to Linear, Sentry and GitLab.

What you see: the issue rendered in full, through the same page anatomy every other host already uses. Key, summary, description, status, type, priority, assignee, reporter, labels, dates, and the comment thread. Jira's rich text is converted to markdown on the way in, and the nodes we do not model flatten to their text rather than disappearing.

What you can do to it: comment, assign or unassign, move it through its workflow, and edit the description. Assign and transition are the first of their kind anywhere in Goodboy, since no other connected host has ever had them. The move menu is built from the transitions Jira reports for that one issue, never from a fixed list of statuses, because every Jira project carries its own workflow. When the workflow cannot be read the control stays where it is and says why, instead of disappearing.

Where it takes you: Start session on any issue opens a session with the goal and the branch name already seeded from the ticket, and the ticket linked to it. Pasting an `atlassian.net/browse/KEY` URL into Link work does the same.

The limits. Jira Cloud only, no Data Center or Server. API token, no OAuth. One project key per workspace. Assignable users come back one page at a time, so on a large project the filter box searches the first page. A transition that needs a screen is offered and attempted plainly, and Jira's answer is shown as it comes. The mobile companion cannot list or create sessions from Jira issues yet.

The honest part: none of these calls has run against a real Atlassian site. Every endpoint is tested against fixtures built from Atlassian's own documentation, which proves the request shapes agree with the docs and proves nothing about the docs. If the issue search behaves differently from its documented shape, the inbox will be empty and none of those tests will have caught it. Try it, break it, send the error back.

### [#1235] Moonshot, with Kimi K3

Moonshot is a provider in its own right, not a row in someone else's catalogue. Its own connect flow, its own key, its own mark in the picker. Kimi K3 shows up everywhere a model is picked, with the full effort ladder.

It sits in the mid cost bracket, priced per token the same as Sonnet 4.5, and it is weighted so automatic routing can reach for it on mid-tier work without ever displacing the models that carry the code roles. A test now pins that band, so the next model added cannot quietly outrank them.

Unverified here too: the model id comes from opencode's registry and has not been resolved against a live Moonshot account.

### [#1234] Plans reads like every other lens

Plans had a grammar of its own. Landing on it silently opened the last plan you happened to create, and the rest lived behind an Other plans button that slid a resizable panel in from the right, with its own close control. Nothing else in the app worked that way.

It works like workflows now. No active plans shows an empty state, with the consumed ones behind a count you can reveal in place. Active plans show as a list. Clicking one opens it as a subpage with a breadcrumb and a back button. The right-hand panel is gone.

Two things that were quietly broken are fixed by the same change. Clicking a plan chip in a transcript while already on the Plans lens did nothing at all, and neither did clicking Plans in the breadcrumb while a plan was open. Both read the store once at mount and never again. Both work now.

### Smaller fixes

- [#1237] The Jira comment box says plain text, because that is what Goodboy sends, and markdown you typed would have been stored literally
- [#1237] Acting on an issue refreshes the row in the list beside it, so the detail and the list cannot show two different statuses at once
- [#1237] Switching issues in the inbox right after a write no longer paints the previous issue's title under the new issue for a frame
- [#1236] The onboarding tracker step offers Jira as a live choice instead of a greyed-out badge
- [#1236] Connecting only Jira completes the tools step of the onboarding checklist, which used to need Linear or Sentry

## Goodboy v0.1.62

Click a linked issue and you land on that issue, not on a list of them. The review thread behind a resolver reads in the chat card, and a workflow step that refuses to start finally says why.

### [#1228] A linked Linear, Sentry or GitLab issue opens focused

Clicking a named linked object from Linked work or from the pull request pane opened its provider lens on the full inbox, with nothing selected. You clicked one issue and got the list. GitHub was the only source that had a focus slot, so it was the only one that landed where you pointed.

The three other sources have one now. A click carries the provider and the external id into the store, and the pane behind the Linear, Sentry and GitLab lenses opens that task's detail instead of the list. Opening the same lens from the rail still shows the list, because the focus clears the moment you change lens, so nothing you clicked earlier is waiting for you the next time you go looking.

GitHub goes through the same action for symmetry, which fixes a smaller thing on the way: a session with two linked GitHub tasks used to always open the first one, and now it opens the one you clicked. A linked pull request chip inside a Linear issue routes to the pull request in the app rather than to a browser tab, and falls back to the browser when the session does not track that pull request or when a studio overlay is covering the surface it would navigate to.

### [#1227] The review thread reads in the chat card

When a resolve fans out, the card in the transcript listed each review thread by title and offered a button that left for a browser tab. The thread body was already in memory, fetched with the pull request detail, and the card showed none of it.

The card now docks the real thread, collapsed, and opens it in place with the comment bodies, the authors and the resolved state. It reuses the same thread view the pull request conversation renders, so the two agree. When the pull request detail has not loaded yet, or the thread is not among the ones loaded, the card falls back to the summary it always showed with an honest link out. The resolver lane's jump to a source comment now also matches its way back to a thread in the app before falling back to the browser.

Reading is all this ships. Replying and resolving from the docked thread stay where they are, in the queue that batches them, because moving them is a separate decision.

### [#1230] A workflow step that will not start says so

The advance button re-read the gate from the database, got refused, and showed nothing: the button reset, the run stalled, no message. The rejection had no catch anywhere along the chain, so it landed nowhere. This has now been the same failure twice.

A refused advance raises the notification that was already written for it, addressed to the session, and the skip-a-stuck-step path got the same treatment. Underneath both, the app now has a global handler for a rejected promise that nothing caught, so a failure with no home surfaces instead of vanishing. Expect to see failures that were silent before.

Two engine surfaces stopped lying while we were in there. One unanswered question from a free agent used to block every workflow run in the session, because a question with no run attached matched every run; only a question belonging to a run blocks that run now. And the next-step badge recomputed its model from your current preferences while the run used the model frozen when the agent was spawned, so changing a preference mid-session made the badge show a model that was not going to run. The badge reads the frozen value, on both the chat strip and the workflows list.

### [#1231] Answer chips are in English

A yes-no question from an agent rendered its two answer chips in Italian. The fallback that generates them when a question ships no answers of its own, which is most of the time, was written with Italian words in it. They read `yes` and `no` now, and the question patterns that trigger them are English only.

Completed work on an integration lens also folds behind a count instead of listing every closed issue inline, matching how the workflows lens has always handled its finished items.

### Smaller fixes

- [#1226] Opening the diff from a resolver lands on a fresh view instead of whichever commit the previous resolver was looking at
- [#1229] A resolution that failed to push loads with the session instead of waiting for you to visit the overview first, so the resolve lens shows its pending push and its rail marker without a detour
- [#1229] A resolver that fails to start reports it, rather than failing silently
- [#1231] The kind an agent gets assigned no longer prints a warning to the console in release builds

## Goodboy v0.1.61

A linked GitHub issue opens inside the session now, from every place that lists one. A plan run that gets held back says so instead of doing nothing, and a resolver verdict survives a restart.

### [#1223, #1224] Linked GitHub issues open where the work is

A GitHub issue linked to a session was the last integration object that sent you to a browser tab. Linear, Sentry and GitLab already routed theirs internally. The GitHub issue view had been write-complete for a while, comments and description edits included, but the only way to reach it was one tab inside the GitHub studio, so every other surface fell back to a link.

There is now a GitHub issue lens, and every entry point goes through it: the linked issues parsed from a pull request body's "Closes #N" lines, the work items on the pull request pane, and the linked work list on the session overview. The lens takes an issue number directly, so an issue mentioned by a pull request opens even when nothing links it to the session as a task. In the session overview, the two lists that used to disagree with each other now behave the same way.

Two labels stopped lying while we were in there. The resolver thread card said "Open on GitHub" for a click that never left the app, and the pull request pane said "Open in code host" for a button that opens the create-PR panel in place. The changelog's release view dropped its "Open on GitHub" button, which duplicated a body already rendered underneath it.

One entry point stays external on purpose: the issue links preview inside the create-PR form, because navigating away from a half-written pull request would discard the draft. Assigning an issue and moving its status are still not built, on any source.

### [#1220] A plan run that is held back says so

v0.1.60 moved the open-question gate into the engine, and the plan run path was never wired to it. Pressing Run plan with an unanswered question in the session did nothing at all: no run, no error, no message. The rejection had nowhere to land, because the app has no global handler for one.

The plan run now goes through the same wrapper the workflow paths use, so a blocked run raises the notification that was already written for it. The pipeline lane on the session overview carried the identical unguarded call, unreachable today but one refactor away from repeating this, and it is guarded now too.

A held-back run also stops reporting itself as started. The wrapper swallowed the refusal but the caller still returned an agent id, so an "Implementer started" toast fired for a run that never began, right underneath the warning saying it had not. The same false announcement on the auto-advance path is gone as well.

### [#1221] A resolver verdict survives a restart

A queued resolution stored its verdict only in memory. Restart the app before pushing, and the verdict was gone: push-all read nothing, found the reply had already been posted, did nothing about the thread, and deleted the row on its way out. The review thread stayed open on GitHub and disappeared from the pending queue with no notice.

The verdict is now written with the row. Where the thread came from an agent's settlement, it is carried through directly. Where it came from a single-thread resolve, it is derived from what was actually posted: a commit means resolved, a stated reason means wontfix, a reply on its own means analyzed, and a resolve that posted nothing records no verdict rather than inventing one.

This also fixes the display it fed. A queued thread used to read as open after a restart even when it carried a real verdict, because the same missing value was standing in for one.

### Smaller fixes

- [#1222] The session goal editor keeps what you wrote when you close it. Escape and Cancel used to wipe the draft outright, and an unsaved draft now carries a marker next to the trigger
- [#1222] Editing the goal field directly no longer leaves a stale expanded draft behind that a later save would write back over the newer text
- [#1222] Six performance logs stopped printing to the console in release builds

## Goodboy v0.1.60

GitLab stops being a read-only mirror: the merge request conversation, its approvals, and issue comments all live here now. The open-question gate moved into the engine, and a retried resolution no longer posts the same reply twice.

### [#1215] The merge request conversation, and the actions on it

Goodboy could already post to a GitLab merge request and never show you what it posted. `gitlab_create_mr_discussion` and `gitlab_create_mr_note` shipped wired only into the review publish flow, so an agent could leave an inline discussion you had no way to see without opening gitlab.com. The merge request detail rendered three things: state badges, the description, and a merge button.

There is now a Conversation tab. Threads render their head note and replies, with the file and line when the discussion is anchored to a diff position, and a resolved badge when every resolvable note in the thread is settled. GitLab system notes are filtered out and the count reported underneath, so "changed title from X to Y" does not bury the review. An Approvals row shows how many approvals are in, how many the project requires, and who gave them.

From the same panel you can reply inside a thread, post a standalone note, approve or revoke your approval, close, reopen, and toggle draft. GitLab models draft as a title prefix, so the toggle rewrites the title and handles the `[Draft]`, `(Draft)` and legacy `WIP:` forms. Every action reflects its result without a manual refresh, because the command returns the updated merge request and the panel adopts it.

Still ahead: resolving a thread from the app, emoji awards and suggestions, and anchoring an existing discussion inside the diff viewer. There is no polling. Instances without the approvals endpoint hide the row rather than taking the panel down, which also means their approval rules are not shown.

### [#1218] Comment on and edit a GitLab issue in place

A GitLab issue showed its title, description, and state, and nothing else, while GitHub issues already took comments and description edits. Both GitLab issue surfaces now carry the same tabbed layout as the merge request panel: notes render oldest first with the composer at the bottom, system notes filtered and counted the same way, and the description is editable inline through the same editor the other issue sources use.

### [#1214] The open-question gate moved into the engine

v0.1.59 closed three manual bypasses one call site at a time, but the gate still lived in the callers, so every new entry point could forget it, and one already had: the mobile bridge reimplemented next-step selection and activated a step with no gating at all, so a phone tap could force a run past a question the desktop blocks on.

Starting a pending step now refuses by default when its workflow run has an unanswered question, and only an explicit bypass gets through. Four call sites carry that bypass, each one a start the operator already confirmed. Every refusal reaches you rather than disappearing: the orchestrator records the block and the panel asks for an answer, the mobile bridge returns the real reason instead of a generic failure, and fire-and-forget starts raise a notification. Forcing a skip past a blocked step now carries that decision into dynamic runs too, where it used to be dropped.

One related fix on the same path: a stuck step could be force-skipped from the sidebar for a session you had never opened, because the check read in-memory turn state that is only filled in for the session on screen. It now reads what the database says first.

### [#1216] A retried resolution posts its reply once

Resolve posted a reply and then resolved the thread with nothing tying the two together. If the resolve failed after the reply had already landed, the queued row stayed put and the UI invited a retry, which posted the identical comment again, compounding every time. A resolution now records that its reply went out before it attempts the resolve, so a retry skips straight to resolving. The ad-hoc single-thread path had no queued row to record against, so it persists one first.

Three more on the same path: the push-all summary only counts a comment when one actually went out, the outcome dispatch is exhaustive so a new outcome cannot fall through it silently, and a resolver turn that fails now says so instead of failing quietly. Two resolvers can no longer start at the same time, and the hand-off to the next resolver in a chain still runs.

### [#1217] Review drafts stay on the pull request they were written for

Publishing a review selected every draft in the session and never checked which pull request it belonged to, so drafts staged against one PR could post onto another. v0.1.59 opened a second place to publish from, where the target and the drafts could disagree. Drafts are now matched to the resolved target, and the ones that belong elsewhere stay where they are and are reported rather than posted.

### Smaller fixes

- [#1217] Deleting a provider API key or removing a budget cap asks first, and names what it is removing
- [#1217] Switching agents no longer carries the previous agent's diff jump and merge dialog over
- [#1217] Spawning from the composer no longer pulls you into the chat view
- [#1217] A disabled Run control keeps its tooltip, so it can say why it is disabled
- [#1217] The questions pane shows a skeleton instead of flashing "no open questions" before it has loaded, and the pull request pane has a loading skeleton on first fetch
- [#1217] The companion setup reports a failure in words instead of printing the raw exception
- [#1217] The link-issue form shows its error in the footer, where the other forms put theirs

## Goodboy v0.1.59

Approving a pull request and replying to an issue both happen here now, a queued resolution never closes a thread nobody settled, and a workflow stops walking past a question nobody answered.

### [#1209] Approve or request changes from the pull request panel

The GitHub pull request panel rendered the whole PR and could merge, close, reopen and toggle draft, but it had no verdict control, so approving meant leaving for a browser tab. A Review action now sits in the same bar: approve, request changes, or comment, with an optional summary. It shares in-flight state with the other writes, so nothing else fires while a review posts, and it is hidden on merged and closed PRs where a verdict means nothing. One thing had to be fixed before it could ship: the publish path resolved its target from the session's first linked pull request rather than the one on screen, so in a session with more than one PR a verdict would have landed on the wrong one. The panel now passes the PR you are looking at. Note that submitting a verdict also publishes any review drafts staged in that session, which is how the publish path already behaved.

### [#1210] Read and write a GitHub issue conversation in place

A GitHub issue showed its title, state and description and nothing else. Its conversation was invisible, and no issue in the product had a composer at all. The issue detail now carries a Conversation tab with the full thread (author, date, markdown body) and a composer at the bottom that posts back to GitHub and reloads the thread. When a post fails it keeps what you typed and shows what GitHub returned. This is the first issue comment you can write from inside Goodboy. Linear, GitLab and Sentry issues stay read-only for now.

### [#1211] A review thread never closes on a verdict nobody gave

A queued resolution carrying no verdict was read as a fix, so the thread was resolved on GitHub. Every row written before the verdict column existed carries no verdict, so this was reachable rather than theoretical. An unknown verdict now posts its reply, leaves the thread open, and says so in the toast. Three more fixes on the same path: a batch that hits an error keeps going instead of abandoning every thread after the first one and still refreshes what it did close, a rejected push no longer marks items failed that never needed the push, and the three paths that delete queued resolutions can no longer run at the same time and post the same comment twice.

### [#1212] A blocked workflow says so at the button

The open-question gate stopped a workflow from marching past a question nobody answered, but enforcing it was left to each caller, and three manual start paths walked around it. Both run start buttons now carry the blocked state at the action itself and route through the same confirm the next-step action already used, so starting anyway is a deliberate second click. Starting a step agent refuses an unconfirmed start of a blocked run instead of relying on the caller to have checked. Engine-level enforcement, where the gate lives inside the store action rather than the buttons, is still ahead.

### Smaller fixes

- [#1208] A linked GitHub issue opens the issue instead of landing in the pull request pane
- [#1208] External links go through one shared open path rather than raw anchors that a webview may not honor

## Goodboy v0.1.58

Deleting a session no longer leaves an orphaned worktree behind, a new Storage section lets you see and reclaim what archived sessions cost on disk, the issue-to-PR loop closes on GitHub and GitLab alike, and Linear and GitLab issue descriptions get the same in-app editor GitHub already had.

### [#1202] Deleting a session cleans up its worktree, every time

Deleting a session could fail with "Directory not empty" when a dev server was still running inside its worktree: git de-registered the folder anyway and it stayed on disk forever. Closing a session now kills every process in its terminal session, not just the shell, waits for the terminals to close before touching the filesystem, retries the removal and falls back to deleting the folder directly if it still won't budge, and reports the path if it truly can't. On startup, folders git or the app lost track of are found and offered up for cleanup, never removed automatically.

### [#1203] See what archived sessions cost on disk, and reclaim it

Settings gets a Storage section, above the danger zone, showing the database size and how much archived sessions' transcripts and worktrees add up to. Two explicit actions, each confirmed twice: prune archived transcripts (deletes their `turn_events` rows and vacuums the database so the file actually shrinks; the chat view of an unarchived session comes back empty, though the session's own messages stay in the database) and remove archived worktrees (drops the folders and keeps the branches, so a worktree can be recreated later). Nothing runs on a timer, nothing runs automatically.

### [#1205] The issue-to-PR loop closes on GitHub and GitLab

An issue linked to a session after its pull request was already open never got a `Closes #N` line, so it never auto-closed. Linked issues now get a "Link issue" action that adds the reference to an already open PR. On GitLab, a work item now also completes when its merge request merges, matching the behavior GitHub already had.

### [#1204] Edit a Linear or GitLab issue description in place

GitHub issue descriptions became editable in-app in the last release. Linear and GitLab issues now get the same editor, writing straight back to the provider.

### [#1200] A resolver's verdicts survive a restart

Restarting the app used to wipe a resolver's decisions on a review thread, and the "no verdicts" warning would blame the agent for threads it had actually resolved. Verdicts are now rebuilt from the session transcript on load, so a restart no longer loses them.

### Smaller fixes

- [#1201] The "update available" chip pulses three times, then rests, instead of forever
- [#1198] Spawning a resolver shows a status dot instead of a spinner

## Goodboy v0.1.57

One visual grammar across every screen, a provider you connect in one click, diffs side by side, and the round where a workflow's orchestrator stopped hiding what it decided.

### [#1174] One grammar for every lens

The integrations lens, the inspector and the workflows lens had each grown their own way of drawing a header, a row and an empty state, so the same idea looked different depending on where you found it. They now share extracted primitives: agent cards come down to three tiers, the explore tree is a tree again, history stops crowding the present, and a pulsing dot means something is actually running rather than decorating a finished card. Creating something no longer yanks you somewhere else, and navigation is an explicit choice instead of a side effect. The theme toggle is back in reach, prose in a list has one answer, and the resolver panel is readable: replies follow a contract, comment previews stop showing their raw source, and control markers no longer reach the screen.

### [#1175] One rhythm for every pane, one click to connect a provider

Every pane measure is centred inside its surface, the chat header lines up with the transcript, the workflow builder and the provider studios sit on the shared rhythm, each region has exactly one scroll owner, and every studio panel has a real heading. Connecting a provider used to mean a terminal and a copy-pasted command: it is one button now, backed by a per-provider state machine that probes real auth, injects its own login env, opens the most auth-shaped URL it sees (never a docs link, and never an unsafe one), reads the URL across PTY chunk boundaries, and keeps probing after the login process exits. The inbox is told when a provider connects. Dates and money are formatted at one pinned locale and one precision, so the same number reads the same everywhere, and a GitHub or GitLab issue opens in full inside the session pane.

### [#1177] The orchestrator says what it decided, and who decides next

The run pill contradicted the strip, the card said "running" three times, and a run stuck on a failed step stayed frozen. The strip is rebuilt around a derived state ladder, a run gets a generated title and can be renamed from its header, lifecycle actions live in the detail header, and open questions surface even under autorun. Spend is charged to the run that made the decision rather than a faked turn, with the orchestrator's own telemetry kind, and a run records why it stopped instead of leaving you to read it off the copy.

### [#1179] One detail grammar, one diff geometry

The GitHub, Linear, Sentry and GitLab detail panes each carried a right-hand column that squeezed the content and left the labels misaligned; the properties now live in the header band as one grid, which is also what aligned the studio and session panes. The split diff had columns sized by their content, so every file came out a different width with stray horizontal scroll: both sides are exactly half now, rows wrap, and the layout is identical from file to file. The `@@ -15,15 +16,15 @@` hunk header is replaced by what it actually means, `Lines 16-30 · in export const FlowProvider`.

### [#1178] A resolution reply has a shape

A resolver's reply on a review thread is now wrapped by the app itself: the verdict, your explanation, and the resolution with a link to the commit that carries the fix. The model writes only the middle, so nothing states the outcome twice.

### [#1180] Fable stays at the top, off the coding roles

A workspace that pointed a coding role at another provider's model could be substituted onto Fable when the run landed on Anthropic, because the substitution picks the strongest model in the same cost tier and Fable outweighs Opus. It still does, and the escalation paths that depend on that ordering are untouched. Fable is marked as a thinking model instead, and the substitution skips it for anything but a role that only thinks.

### [#1181] The pull requests a session actually has

The session's code-host pane offered one CTA, "open in code host", even when the session had a pull request. It lists every pull request on that branch now, with its state, the one you are reading marked, and a click to switch between them.

### Smaller fixes

- [#1174] Reaching a resolver's diff no longer needs the inspector, and the shortcut stops claiming a file while it is still loading
- [#1175] The overview skeleton matches the pane that replaces it, and the issue inbox skeleton no longer grows unbounded
- [#1177] A step summary gets a 60s budget and its child is killed on timeout, with the retry running against the original output
- [#1177] Toasts moved to the top right, under the bell, and stay above the panels they warn about
- [#1179] A refused model pick is notified instead of silently ignored
