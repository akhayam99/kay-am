# Navigation and information architecture

> **Read this when** deciding what surface exists and where it lives: pane,
> sidebar, strip, footer, breadcrumb. **Not for** spacing/scroll/overlay
> mechanics (`docs/styling.md`) or design intent and tone (`DESIGN.md`).

## The model

- **The board is home; chat is a destination.** With a workspace open and no
  session selected, main is a cross-session stage board (needs you / running /
  in review / building / done). Chat, diff, terminal and open-in-IDE are
  reached from cards, never landed in; every capability stays one navigation
  away.
- **Four surfaces, four jobs, no competition.** Top bar is chrome ("where am I
  and what is it costing"), footer is access ("where do I go"), sidebar is
  presence ("what else is going on"), the ⌘K palette is transit ("where do I
  want to be").
- **The top bar carries state and identity, never destinations.** It never
  edits a record in place; anything that opens a destination belongs to the
  footer.
- **One home per thing.** If a thing must exist in state A and can exist in
  state B, it lives where it must and B gets no second copy. Workspace identity
  is permanently pinned at the top bar's left, and the sidebar renders no
  workspace name on either the board or inside a session.
- **Pin the structure, flex the density.** A control's position is fixed so it
  can be learned. No control appears or disappears at a count threshold, though
  counts themselves may: a chip reading zero is noise, not structure. Two
  exceptions. Integration groups sit in a row, so connecting one shifts
  controls to its right: position is fixed in order, not in absolute terms. The
  update control comes and goes with a pending update, earning that by being an
  event rather than a count.
- **Hidden is not gone.** Anything the user can put away must come back without
  hunting for it. A hidden sessions column peeks back from a deliberate anchor
  or the pointer resting at the window edge, and peek floats the one sidebar
  rather than laying it out.
- **Navigation chrome is neutral at rest.** Selection reads as a muted fill,
  never an inversion: the app has no inverted navigation control. One
  exception, "Back to board" is tinted `primary`, the single sidebar action
  that leaves the session.
- **Settings match the scope they edit.** Application settings is a full-page
  studio, workspace settings a scoped pane. Changes save instantly: no
  Save/Cancel footer, no stacking one settings surface on another.
- **One overlay slot.** Workspace-scoped editors share a single overlay over
  main so the sessions column stays visible; one at a time, by strict
  precedence, never stacked. Scope decides the pattern: session-scoped editors
  layer over the session pane, app-level studios are full-page, and what became
  a lens stays a lens.

A second entry point reuses the mount, never builds a parallel one: the palette
dispatches an event the owning component listens for, and the keyboard path
calls the same hook method as the button.

## Surfaces

**Shell layout.** One strip of chrome above, one footer below, and between them
one sidebar plus main. **There is one app layout and every surface fills its
slots**: board, session and studios do not define their own frames, and a
surface needing a different frame changes the shared one rather than forking a
second. **Two flanking columns at once is not the IA**: a session draws one
full-width pane and its navigation lives in that single left sidebar, so
nothing has to reach for a second column and there is no second width to
persist. The sidebar carries presence, appearing when
there is something else going on to be present about, and inside a session it
follows a persisted preference toggled from one control or ⌘B, which peek never
touches.

A window is a strip, a set of columns, and a pane. Each owns one thing.

**The strip** is one row closed by a `<Divider />`, rendered **outside** the
grid, so no column resize, no hide animation and no overlay can move it.

**The columns** are one grid at persisted widths, clamped on read.

- **A column has one reduced state, and it is never a narrower copy of
  itself.** Hiding zeroes the column and its handle and marks the aside
  `inert`, because a zero-width column that still takes focus is a keyboard
  trap. Narrowing to a rail is legal only where the content survives at rail
  width; where peek already answers "let me glance at it", a rail would be a
  second copy of the same list and is not added. The shell primitive can lay
  out more reduced states than the product uses: which one a column gets is
  this decision, not an availability question.
- **The overlay slots sit inside the grid, not above it.** A floating overlay
  spans the full row so a peek can hover over main without taking layout; a
  full-surface overlay spans the work area and stops short of the sessions
  column, so an editor never hides where the user is.

**The pane** is the work: the only surface that scrolls its own body, mounts
editors and takes a title.

**The scope bar states which projects a session has materialized.** It sits
above the session pane, lists the mounted projects, and carries the
**+ project** chip that materializes another one. It renders only when there
is a choice to state: one mount in a one-project workspace needs no bar.
Sessions are created lazily on the workspace ([concepts.md](concepts.md) →
Lazy sessions), so the bar is also where a session's footprint grows.

**Inside a session the sidebar stays the sessions list.** There is no second
mode: the sidebar lists the workspace's sessions grouped by stage, and the open
session tells its own story in the main pane. Lens surfaces still exist, but
they are reached from rows and chips inside the overview (expand-in-place or
side panel), never from sidebar navigation. Board → session is the whole depth
of the navigation.

**Peek is a display of the sidebar, not a second sidebar.** The overlay renders
the same sidebar component; there is one sessions list in the codebase. It is
wider than the pinned column, applied at read time so widening the peek never
moves the column, and it opens faster from the strip toggle than from the screen
edge, because a deliberate anchor is not a graze.

**The session overview is the reference page.** It carries the whole surface
grammar on one screen; read it before designing a new one. Its rhythm: section
eyebrow, at most one action in a section header and one primary
button per section, a `<Divider />` between sections and never a border on one.
A section appears when its fact exists (a plan, a workflow run, a PR on a
project); before that it stands as one quiet action row (link an issue, start
an agent, attach a workflow), so the empty session reads as a young version of
the same document instead of a wall of placeholders; finished work collapses
into one summary row per category. Urgency is carried by the surface, never by a badge
parked beside it.

## Breadcrumbs

- **The trail belongs to the page, not to the chrome.** It sits above the
  session pane, never in the top bar, because the top bar is workspace chrome
  and a session trail is page context.
- **The trail starts at `Overview`, and the session name is not a crumb.** The
  sidebar already carries the session identity, so repeating it in the trail
  spends a crumb on something the user is already looking at.
- The last crumb is the current location and is never clickable. A list view
  never pre-populates a crumb for an item the user has not opened yet.
- **An integration trail hangs off its own tool**, named as the sidebar names
  it (GitHub, GitLab, Jira, Linear, Slack), at the same depth as any
  other lens: a studio belongs under its tool, never under another tool's lens.
- **Opening a child extends the trail and preserves every ancestor**:
  `Overview > {HomeLens} > {Agent}`. Selecting a sibling changes only the last
  crumb and the child region.
- **The trail describes the structure of the app, not the history of the
  session.** A parent is derived from the object that is open, never from the
  surface the jump came from: selecting an agent leaves the active lens where it
  was, so that lens is only ever where the user came from. The activity feed,
  the palette, a notification, a linked-work chip and a restored session are
  shortcuts into a place that already has a parent, and none of them may rewrite
  it. History is what Back is for.
- **A child hangs off the overview section that owns it**: a step under its
  run under Workflows, an ad-hoc agent under Agents, a fix attempt under Review.
  The overlay's back target still prefers the surface the user was standing
  in, so Back returns where you were while the trail states where you are.
- **A crumb with siblings is a switcher**: plain text when the agent is alone
  in its home lens, otherwise a popover that switches the open agent in place.
- **The workflow case extends the same control**:
  `Overview > {WorkflowKind} > {Step}`, plus a fourth crumb for implementer
  clusters (the child's name, or `{done}/{total} clusters` when the root is
  selected). No separate step strip, no "Part of {Workflow}" line.

## Top bar

Workspace identity stays on the left, the Goodboy brand is centred on the
window, and workspace-wide signals and set-once preferences stay on the right.
The bar is one three-column grid, `minmax(0,1fr) auto minmax(0,1fr)`, so the
brand sits at the window midpoint rather than in leftover space; the identity
holds a bound and truncates with the full name in its tooltip, the wordmark
drops below `brand-word` and the mascot below `brand-mark`, and no control ever
moves into an overflow menu.

- Workspace identity opens an anchored popover that switches and creates
  workspaces; ⌘O and the palette open that same popover, never a second one.
  Workspace settings has its own control next to identity: buried inside the
  switcher, a common per-workspace preference was easy to never discover.
- **Identity is pinned and mounted once.** Workspace identity stays at the top
  bar's left on the board, inside sessions, and under studios. Exactly one
  switcher is live, and ⌘O and the palette open its single anchored popover.
- Theme is the one set-once preference kept here, flipped often enough to earn
  the slot. The guide and pair-device live in the settings studio and palette.
- **The report control is the one carve-out from "the top bar never edits".**
  Its popover drafts a bug report, which is not a record until filed; the draft
  survives closing the popover, and the primary action opens the full form
  rather than sending. Precedent: VS Code's top-level issue reporter.

## Footer

Left: the integrations connected to this workspace, followed by one **Link
integration** action. Each connected integration is a named glyph that opens
its studio. The action lists every available integration and its connection
state, so connected and disconnected tools stay reachable through one flow.

- With nothing connected, the action explicitly invites the first connection.
- The glyph strip scrolls horizontally inside its region. The link action stays
  fixed, so many connections never displace the rest of the footer.
- The footer does not gate on repository presence. Turning a folder-only
  workspace into one backed by a git repository is offered from the workspace
  link and convert flow, not from the footer.

Right: the launchers reached by name, the update control while an update is
pending, and a `More` popover for the rest.

- **The release dot answers "have you read the notes for what you're
  running"**, not "has a new release been published". It answers offline, never
  lights up for a version the user cannot install, and a fresh install shows
  one dot, not one per release.
- Exactly one integration control carries the active fill, on the open glyph or
  on the link action when that integration is disconnected. Opening any studio
  closes the others.

## Shortcuts

One registry, three modifier planes: bare ⌘ for the app, ⌘⇧ for the session,
⌘⌥ for the lens surfaces. A combo string is never written by hand outside the
registry, so no two surfaces can claim the same chord and no shortcut can exist
undocumented. **A shortcut is taught where it is used**: a
control that has one shows it, as a pill on hover in dense rows and a
parenthesised glyph in tooltips; where the row is too tight, the tooltip is the
mount.

## Studios

Utility studios are fullscreen overlays rendered between the top bar and the
footer, so both bars stay visible and interactive. They are not part of the
breadcrumb IA, exit on close or Esc, and only one is open at a time.

- **Not every studio earns a footer entry.** Notifications opens only from the
  bell popover, since the bell already carries the unread count. Report an
  issue opens from the top bar, Settings' App scope panel and the palette: it
  is settings-adjacent, not a peer of the named launchers.
- **Master-detail is not the dual-sidebar anti-pattern.** A narrow list rail
  beside a detail panel is fine; "no left panel and right panel at once" is
  about two sidebars flanking content, which the app does not do.
- **Disconnecting is scoped.** A connected integration studio can disconnect
  from its own header, and that clears the workspace credential, never a
  system-level session: a workspace running on the system `gh` CLI has nothing
  workspace-scoped to clear, so it offers no disconnect and points at
  `gh auth logout`. The control is gated on credential state alone, not on the
  git remote, so a leftover scoped personal API key on a non-GitHub workspace can
  still be cleared.
- **A code-host studio mounted outside a session is browse-and-launch only.**
  The write verbs (approve, request changes, comment, merge, decline) are keyed
  to a session and stay disabled; the mount reads through the workspace's first
  repo project, so a workspace with no repo project stops at an empty state.

## Lens surfaces

- **One level at a time, never a rail plus a detail at once.** Selecting a card
  swaps the list for the detail, and the list is the only way back. Completed
  and discarded groups sit behind header toggles that self-hide at zero, so a
  session whose runs are all done shows an empty state instead of opening the
  last completed one.
- **A step chat is one explicit click**, never an automatic redirect.
- **A lens-wide toggle is its own row**, never inside an empty state's action
  slot.
- **A sibling detail is a split, not a rail**: a resizable column owned by the
  pane it opens in, so it dies with that pane. There is one implementation of
  that split; reuse it rather than growing a rail.
- **Review is the pull request destination for GitHub, and it has no second
  copy.** One lens holds the review conversations, the PR details, the PR
  activity, the checks, the create-a-PR form and the reviewer's own draft
  review; they are detail modes of that one surface, switched from its dock,
  and the conversation list never leaves the screen while a mode is open. There
  is no GitHub studio layered over a session: a saved `pr` lens on a GitHub
  session lands on Review. The code-host lens keeps serving GitLab and
  Bitbucket, which still open their own studios. Everything the lens shows
  comes from one durable conversation model, and everything it sends leaves
  through one publisher, so a restart finds the same rows in the same states
  and there is no second path that pushes a reply or closes a thread.
- **A lens surface is reached from the overview, never from a rail.** Rows and
  chips inside the overview route to it, expanding in place or opening a side
  panel; counts and dots are read-only signals on the row that routes there.
  Session lifecycle actions are not navigation and do not belong on those
  rows. A count on a row is a promise about that destination: it counts the
  items the destination lists, and every surface that routes to the same
  destination shows the same number from the same selector. A population with
  no home at the destination gets no badge pointing there.
- **The activity bar shows ALL sessions grouped by stage**, never filtered to
  running only.
- **A blocked action is re-routed, never hidden.** A blocked workflow advance
  states the reason on the CTA and opens an inline confirm before anything
  spawns. With auto-run off nothing advances without a click.

## Creating a session

The new session form lands on Overview, always, and offers no agent-kind picker
before the session exists: the kind is a choice inside a session, not a
precondition for having one. Its issue sources are a curated allowlist, not the
union of connected providers, because a connected code host does not imply an
issue picker; the section hides when none of the allowed sources is connected.
Creating a session picks no project either: the session is born on the
workspace with a container directory only, and projects are materialized when
the work reaches them ([concepts.md](concepts.md) → Lazy sessions).
