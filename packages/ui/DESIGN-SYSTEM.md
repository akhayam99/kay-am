# Design system

> **Read this when** you need concrete tokens, scales, or primitives to implement against. **Not for** intent and product judgment (`DESIGN.md`) or Tailwind authoring mechanics (`docs/styling.md`).

Tokens, scales, primitives and visual law for `@goodboy/ui`. This file owns the
design system layer: invariants and product intent stay in [DESIGN.md](../../DESIGN.md),
Tailwind mechanics and precedence reasoning stay in [docs/styling.md](../../docs/styling.md).

Tokens physically live in `apps/desktop/src/styles.css` under `@theme`. That is
a location, not ownership: the law for what they mean and how they compose
lives here.

## Type scale

`text-3xs` 10px/14px, `2xs` 11px/16px, `xs` 12px, `sm` 14px/20px, `base` 15px,
`lg` 17px, `xl` 20px. Any `text-[Npx]` is rejected; standing exceptions live in
`docs/styling.md`, which owns the authoring rule.

**Every size a repeated row uses declares its own line-height.** Without that
pair, the box height follows whatever `line-height` the size inherits: `3xs` and
`2xs` inherited the body's 1.55 and resolved to 15.5px and 17.05px, which put the
lens rail's group labels and count chips on a fractional pixel and made a row
carrying a count taller than a row without one. `3xs`, `2xs` and `sm` carry a
pinned line height in the tokens; `xs` does not, so a repeated row using it
writes `leading-4` at the call site.

### One grade per role

The grade follows what a thing **is**, not which file draws it. A row label is a
row label in the activity feed and in a brief, so it is the same size in both.
The session Overview is the reference surface: its density was calibrated
deliberately, and a surface that runs a grade larger for the same role forces the
user to pick between a comfortable Overview and a comfortable everything else,
since window zoom scales all of them at once.

| role                                             | grade               | resolves to |
| ------------------------------------------------ | ------------------- | ----------- |
| pane title                                       | `text-xl`           | 20px        |
| section label, and its `hint`                    | `text-2xs`          | 11px / 16px |
| top-level row label                              | `text-sm leading-5` | 14px / 20px |
| nested row label, a child of the row above it    | `text-xs leading-4` | 12px / 16px |
| secondary label beside a row label               | `text-2xs`          | 11px / 16px |
| chip                                             | `text-2xs`          | 11px / 16px |
| metadata inside a row: time, ordinal, cost, hint | `text-3xs`          | 10px / 14px |
| status label                                     | `text-xs`           | 12px        |

**Prose is the one exception, and it is a reading grade, not a drift.** Human and
assistant transcript messages, a markdown body and any artifact the reader came
for stay on the comfortable grade (`text-sm`). Shrinking those makes the app
worse. Chrome around prose still takes the grade its role asks for: a document
pane's section label is an eyebrow even when the body under it is `text-sm`,
because `DESIGN.md` compresses chrome without limit and never the artifact.

## Radius scale

One radius family, one step off square. `rounded-xl` and larger read as bubbly
at this scale.

| token          | value | used for                                           |
| -------------- | ----- | -------------------------------------------------- |
| `rounded-lg`   | 8px   | framed surfaces: cards, banners, inputs, buttons   |
| `rounded-md`   | 6px   | small inset controls: icon buttons, segmented tabs |
| `rounded-full` | n/a   | pills, avatars, circular icon buttons              |

## Spacing scale

The base is `4px`, declared in px and never in rem. Every utility resolves to
`calc(4px * n)`, so the smallest step the scale offers (`0.5`, a 2px gap) is
still a whole pixel and so is everything above it.

A rem base breaks that: the root font size is 15px, which turns the same scale
into a 3.75px grid and leaves most boxes on a fractional pixel. That is invisible
until something animates. An element with a running transition is promoted to its
own compositing layer and rasterised on the device pixel grid, so a fractional
box snaps to whole pixels when the transition starts and back when it ends, which
reads as a one pixel bounce on every icon in the column.

## Gap scale

One restricted, semantic scale, never an arbitrary value.

| token   | separates                      |
| ------- | ------------------------------ |
| `gap-2` | a tight group: icon plus label |
| `gap-4` | controls, or related blocks    |
| `gap-6` | sections                       |
| `gap-8` | a header zone from a body zone |

## Density grades

Four grades, driven by `--density-{compact,cozy,comfortable,scan}`:

- **Compact**: the sidebar.
- **Cozy**: the strips inside a pane, the composer, tool/system transcript rows.
- **Comfortable**: human and assistant prose. Built for reading.
- **Scan**: the stage board and other card grids. Tuned for sweeping a column
  of cards, not reading one.

## Color and tone resolution

- **One tint helper, one stage map.** Tones resolve through `tintClasses(tone)`,
  stage colors through `STAGE_TONE`. No per-file tone maps.
- The stage tones: attention `warning`, running `info`, in review `success`,
  done `merged`, building neutral.
- Elevation is a four-step ramp: canvas < panel < rail/chip < floating. Lift by
  stepping the ramp, never by inventing a shade.

## Icon and tone vocabulary

One module holds two maps over one key set: concept to icon, concept to tone,
the second typed off the first so a concept cannot gain an icon without gaining
a tone or vice versa.

- **One icon per concept.** Never import a lucide symbol locally for a concept
  that already has an entry; add the concept to the map instead.
- **One tone per concept, passed alongside the icon** as a pair at the call
  site.
- **Tone is meaning, not decoration.** `questions` is `warning` because a
  question blocks someone, `decisions` is `success` because it is settled, and
  `plans` is `draft` because a plan is a proposal, not a settled fact. `sentry`
  is `danger` because it is errors, while `terminal` and `settings` are
  `neutral` because they are plumbing. Recolouring a concept changes what it
  claims.

Ten tones (`success`, `info`, `warning`, `danger`, `primary`, `accent`,
`merged`, `draft`, `operations`, `neutral`), each resolving through the single
accessor `tintClasses(tone)`. Components take a `Tone` and call it; they never
hand-write `bg-warning/10`.

### The one identity exception

The session timeline spine is the single place where colour names an object
instead of describing its state. A step belonging to one workflow run has to be
readable as part of that run at a glance, and stage cannot carry that: two
workflows running at once are both `info`, which is exactly the pair a reader
needs to tell apart.

So the lane of a run takes an **identity** colour from a five-entry palette,
`--color-run-1` to `--color-run-5` in `apps/desktop/src/styles.css`, assigned
sequentially across workflow runs and agent chains by creation time and id.
`runIdentity` in
`apps/desktop/src/features/session/timeline/runIdentity.ts` is the only accessor.
It hands out exactly two readings of one slot: `stroke` for an SVG lane and
`chip` for the run's own chip, and `runIdentityStroke` beside it resolves a
stroke back from the index the rail geometry carries.

Three constraints keep the exception contained:

- The identity palette is **separate from the ten tones** and never overlaps
  them. A violet lane is not a plan, a red lane is not a failure; a lane
  colour claims nothing at all beyond "these rows are one run".
- Identity reaches the lane and the run chip that names it, nowhere else.
  Stage stays in the marker sitting on top of the lane, which still resolves
  through `tintClasses(tone)` like everything else.
- The run chip is the one component tinted from identity rather than from a
  tone, so it is deliberately **not** a `Chip`: `TimelineRunChip` in the
  timeline feature owns its own surface and the palette never enters
  `packages/ui`. A pink chip there means "this run" and nothing more.

Anything else reaching for the run palette is a bug. Add a tone instead.

### Lane vocabulary

The activity feed draws structure instead of indenting it. Four ingredients
carry the whole grammar, and nothing outside this list is allowed to appear on
the rail:

| ingredient | value                                                       | meaning                                                   |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| spine      | 1px, `--color-border`, solid, unbroken on every row         | the session's own thread                                  |
| lane       | 2px, identity hue, solid                                    | a run whose steps have happened                           |
| join       | quarter curve between spine and lane at a row's marker line | a run departing at its origin or merging when it finished |
| stub       | 1px, `--color-border`, offset one column                    | a standalone agent's fan-out, which belongs to no run     |

The spine is the backbone of the feed: full height, always drawn, never tinted
and never interrupted.

### The two channels a rail line speaks through

Every stroke on the rail carries two independent readings, and keeping them
independent is what stops either one from being guessed at.

**Pattern is time.** Solid means this line's own work has happened, dashed means
it has not happened yet. The solid-to-dashed boundary sits at the running step,
so the transition itself reads as progress. Dashed means nothing else, on any
line, at any depth, and a dashed stretch always points toward NOW.

**Strength is attention.** A line whose activity has moved onto a live branch
stays solid in pattern and recedes to `--rail-strength-receded` over exactly the
span where that branch is live. The deepest live branch is the only stroke at
full strength; every ancestor over that span steps back. The token mixes 45% of
the stroke on dark and 50% on light toward the surface colour, so the receded
stroke reads as background structure on both themes rather than disappearing
on paper or reading as disabled on ink.

The rule is one predicate over a line and a span, asked identically of the spine
and of a lane, so it holds spine to run, run to fan-out, and at any further
depth the column cap allows without a second rule. Two branches live over the
same rows recede their shared ancestor once, since the statement is about the
ancestor and not about either branch.

The channels are orthogonal, so both statements survive together and in
greyscale. A run's lane past its own running step while a fan-out of its own is
live renders **dashed and receded**: the pattern says its remaining work is
future, the strength says attention is one level further out.

The stub exists because identity names a run and nothing else. A standalone
agent's children are still session work, so their offset line stays in the
neutral spine ink rather than borrowing a run's colour.

Geometry is computed in
`apps/desktop/src/features/session/timeline/railGeometry.ts`; the lane offset is
one 16px unit per level and depth is capped at three columns. Rows are laid out
against `timelineRhythm.ts`, whose grades fix line height, box height and marker
size so a marker centres on its label's line rather than on its row box.

Two rules follow from the direction of time. Newer sits above older at every
level, so a run's origin row is the bottom of its group and its steps stack
upward, and a dash always points toward NOW because dashed means future.

A third rule governs what the feed shows: **everything, always**. Nothing in the
feed collapses, summarises or hides behind a count, and no disclosure control
exists on any row or divider. Density is the only defence against a wall, and it
is carried by the grades in `timelineRhythm.ts` rather than by hiding rows.

## z-index tokens

Named tokens in `apps/desktop/src/styles.css` under `@theme`, keys
`--z-index-*`: Tailwind v4 turns each key into a `z-<name>` utility. The
ordering is a precedence chain; `docs/styling.md` owns the reasoning for it,
this table is the registry only.

| token                        | value | who                                                    |
| ---------------------------- | ----- | ------------------------------------------------------ |
| (StudioShell fullscreen)     | 50    | the floor: never lowered                               |
| `--z-index-popover-backdrop` | 55    | click-catcher behind the app-global popovers           |
| `--z-index-popover`          | 65    | the app-global popovers                                |
| `--z-index-command-palette`  | 70    | ⌘K, which fires whatever else is open                  |
| `--z-index-tooltip`          | 75    | triggerable from inside a popover or the palette       |
| `--z-index-toast`            | 85    | the toast stack                                        |
| (native `<dialog>`)          | n/a   | the browser's top layer, above every z-indexed element |

## Primitives

The register taxonomy and its shared-family invariant live in
[DESIGN.md](../../DESIGN.md). The barrel is the roster: a doc list of
primitives goes stale, `src/index.ts` cannot. A register that needs a shape
the family does not have grows the family; it never keeps a private one.

## Pane anatomy

The package ships the pane primitives `PANE_RHYTHM`, `ScrollFade`, and
`Divider`, not a pane frame. `PaneShell` is a desktop composition at
`apps/desktop/src/shared/components/PaneShell/` built from those primitives:
a scroll region whose body is a centred column. It has one `h1` per surface;
`meta` carries counts and totals in `tabular-nums`, never a control; the header
row wraps, so actions drop under the title instead of squeezing it; the pane
owns the gap below the header and children add no top margins.

**The reading column caps at `max-w-5xl` and centres.** That is 1024px, also
the window's minimum width, so the cap never binds at minimum size: the
sidebar and the pane insets do. It exists for wide monitors,
where an uncapped paragraph runs past a comfortable measure.

`wide` is the escape hatch for a workbench, not a long document, and it is
applied conditionally: the workbench goes full width, its empty state stays in
the reading column, so an empty pane never presents a 2000px-wide dashed box.

## Action zones

The fixed chrome row uses one flexible context region followed by one shrink-safe action region. `StudioShell` exposes that region as `headerAccessory`, `HeaderBand` exposes it as `actions`, and inspector headers use the same `actions` slot. Generic object, lifecycle and destructive controls go there. The action region is pushed to the far end and never enters the content scroller.

The focused object's primary action uses the same fixed header action region. A creation or edit flow instead lands its commit in one action row that sits in the scrolling flow immediately after the last section, with supporting error copy at the start and cancel plus exactly one primary action at the end. Alternates and reset controls join the same row as ghost or secondary buttons. A section-scoped action uses `SectionHeader.action`; a field control uses `FieldRow`; neither promotes itself into global chrome. A surface that genuinely needs a dock argues for one at review; docking is no longer the default for any composition.

That row also shares the measure of the content it commits, never stretched across a shell or container that also holds unrelated content.

`InlineConfirm` stays attached to a destructive trigger in its action region. A detached confirmation in the body or a destructive footer dock is not another zone.

## Section rhythm

`PANE_RHYTHM.stack` separates peer sections and `Divider` separates regions whose boundary matters. Section children do not add margins. `SectionHeader` is the canonical section heading and optional description: the eyebrow size is the default for every surface, and `size="page"` is reserved for a document whose body is prose the reader came for, such as the guide or a creation flow's form sections. Description copy comes only through `hint`, so its size and muted tone remain paired with the heading grade.

**The outline is independent of the grade.** `headingLevel` promotes an eyebrow-grade label to an `h2` or `h3`, so a pane section keeps its place in the document outline without taking the page grade. A section that needs a heading is not thereby a section that needs bigger type.

`SectionSurface` is `SectionHeader` on the one raised section surface, for a
reading surface whose sections would otherwise be separated by vertical space
alone. It is one step off the canvas, so the cards inside it reach the top of
the ramp and nothing stacks a fourth level. A metadata line is not a section and
does not take a surface.

`Eyebrow` is a label primitive for metadata, statistics and small internal groups. It does not replace `SectionHeader` when a section also needs an action or description. `FieldRow` owns a form field's label, help copy and control alignment; it does not title a section. When these roles overlap, `SectionHeader` wins for the section, then `FieldRow` labels the controls inside it. `Divider` is a sibling between regions, never decoration after every heading or field.

## Prose disclosure

`ClampedProse` is the only multi-line prose clamp. It accepts one to six lines, renders the text as preview markdown and reveals the complete text in place through Show more and Show less. Do not apply `line-clamp-*` directly to prose or slice a display string. Single-line identity labels may use `truncate` when their full value is available from the focused object or an accessible disclosure.

Artifacts exempted by `DESIGN.md`, including the text of an open question, never use `ClampedProse`.

## Card action grammar and creation grammar

**One card action grammar.** Two stable slots: navigation top right, always
visible; lifecycle and destructive bottom right. Hover may reveal lifecycle
actions without moving either slot, and keyboard focus reveals the same. Icon
actions use the shared `Tooltip`, never the native `title`.

**A control whose only content is an icon carries a tooltip, everywhere.** The
`aria-label` names it for assistive tech and leaves the pointer with nothing, so
`IconButton`, `OverflowMenu`, `CopyButton` and `RefreshIconButton` wrap
themselves, and a hand-rolled icon button wraps itself in `Tooltip`. The native
`title` waits a second, renders in the OS chrome rather than ours, and cannot be
positioned or styled. Passing `tooltip` says more than the accessible name when
the control needs it, and `IconButton` refuses a `title` at the type level.

There is no exception for a control that can go `disabled`, and no native
`title` for that state either. A disabled element dispatches no mouse event and
truncates the event path above itself, so listeners on the control are dead in
exactly the state where the user most needs to know why nothing happens.
`Tooltip` answers that itself: a trigger that declares `disabled` gets an anchor
span that carries the listeners and takes `pointer-events` away from the
disabled control, so the hover lands on the anchor and the tooltip still opens.
A trigger that needs its anchor shaped, because it is out of flow or stretches,
passes `anchorClassName` rather than hand-rolling a wrapper, since a wrapper
between `Tooltip` and the control hides the `disabled` the primitive acts on.
Keyboard focus is still out of reach while `disabled`, which is the attribute's
own doing. `icon-only-controls-carry-a-tooltip` holds the rule.

**One creation grammar.** Bare sections stacked in one column, never a bordered
box around the whole thing; secondary affordances in `SectionHeader`'s
`action` slot; related options in one container, not one card each; one
action row immediately after the last section, error left, exactly one primary
button right, cancel and alternates as ghost or secondary.

## Empty states

One layout for a lens with nothing to show: `LensEmptyState`, a wrapper that
fixes `bordered` and `size="inline"` and makes `description` mandatory. Lenses
use `inline`, always; only a surface's own main empty state gets the large
size and an `h2`, and an empty lens leaves `headingLevel` unset so it adds
nothing to the document outline.

Inline empty states belong to a lens or compact collection surface. A filled,
borderless inline empty state belongs to a surface's own body and uses
`FilledEmptyState`, which owns its inset and fill. Do not hand-roll either
shape with `EmptyState size="inline"`.

**Inline beats the centred hero** because the pane already has a title and a
rhythm: a hero restates the title in bigger type and pretends the lens is a
landing page when it is one of a rail full of destinations.

**The gap trap.** Separation is owned by the parent flex container, so a child
rendering `<div />` or an empty fragment still costs a full gap step and leaves
a hole nobody can attribute. A component with nothing to show returns `null`,
and the rail filters out groups with no rows rather than rendering a heading
over nothing.

```tsx
if (count === 0) return null;
```

Groups are separated by the step the pane puts between its body children while
rows inside one sit tighter, which is what makes active, completed and
discarded read as three answers instead of one long list.

What "empty" means semantically, and the copy rule for it, are product
invariants and live in [DESIGN.md](../../DESIGN.md).

## Motion registry

Four animations, one meaning each.

- `spin-border`: working.
- `border-pulse`: a warning-stage card needs you.
- `attention-ring`: something new arrived, a finite outward breath (three
  cycles, then rest) on an element that now requires the user, never one that
  is working.
- `soft-pulse`: the only standing-state animation in the app, breathing a state
  that holds and is alive. It breathes the Providers launcher while no provider
  is connected, and the centre dot of the running marker on the activity rail,
  where it sits inside the `spin-border` ring so the pair reads as one running
  state rather than two claims. The bar for a second standing-state animation
  is high.

Motion-safe gating, "motion confirms, never decorates", "motion names who is
working, and for how long", and "Spinners are forbidden" are product
invariants and live in [DESIGN.md](../../DESIGN.md).

## Alignment and truncation

**A column holds its width.** A chip repeated down a list takes a fixed width;
in a right-aligned cluster variable text comes first, glyphs last.

**Truncation order is authored, not emergent.** In the top bar the identity
column carries the only cap and truncates first, and everything to its right is
`shrink-0`, so signals and controls keep their hit areas while the name gives
way. In the rail the label truncates and the count is `shrink-0`, so a long
label loses characters before a count disappears.

**A repeated row is read down a column, not across a line**, so anything whose
width follows its content breaks the column for every row under it.

- A label chip in a repeated row carries a fixed width (`Chip`'s `width`
  prop); `auto` is for one-off chips in a detail panel, never a column. A
  fixed-width wrapper around the chip does not count: it aligns what comes
  after the chip and leaves the chip ragged.
- In a right-aligned cluster, variable text comes first and glyphs last: what
  sits nearest the edge must be constant-width or it wanders row to row. In a
  left-aligned cluster the glyph leads. The test is where the group is
  anchored, not what looks tidy in one row.
