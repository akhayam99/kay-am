# Styling

> **Read this when** implementing spacing, radius, scroll, overlay or z-index
> in code. **Not for** which tokens exist (`packages/ui/DESIGN-SYSTEM.md`) or
> which surface should exist in the IA (`docs/navigation.md`).

The mechanics: how spacing, radius, scroll, overlays and z-index are expressed
in this codebase. The values themselves are a token registry and live in
[packages/ui/DESIGN-SYSTEM.md](../packages/ui/DESIGN-SYSTEM.md).

One ownership rule runs through all of it: spacing is decided once by the
container, never scattered into the things being spaced.

## Separation: `gap`, never margin or `space-y/x`

Space between siblings is the parent's, expressed once via `gap`. Margins and
`space-y/x-*` are forbidden for separation: they scatter the decision across
children, collapse unpredictably, and are asymmetric. Padding-as-spacer is the
same mistake wearing a different name.

```tsx
// good: parent owns the rhythm
<div className="flex flex-col gap-4">
  <Title />
  <Tags />
  <Actions />
</div>

// bad: margins on children
<div>
  <Title className="mb-4" />
  <Tags className="mb-4" />
  <Actions />
</div>

// bad: space-y is margin under the hood
<div className="space-y-4">...</div>
```

Which `gap` is the semantic scale's call, not the component's. The mapping
lives in [DESIGN-SYSTEM.md](../packages/ui/DESIGN-SYSTEM.md)'s gap table.
Never an arbitrary value.

## Padding is for surface insets only

Padding is legitimate only as the internal inset of a surface: inside a card,
banner, input, or a button's hit-area. Never as separation between siblings.
Insets stay compact: `p-3` for dense list rows, `p-4` for standard cards and
banners, `p-5` for a hero surface. `p-6` and larger make a card feel emptier
than its content warrants.

## Edge insets belong to the host, not the child

The space between a hosted component and the pane edge, on all four sides, is
the host wrapper's. A child reaching out with its own `pb-*`/`px-*` makes a
layout decision that is not its to make, and it breaks the moment that child is
hosted somewhere else.

```tsx
// good: host owns the edge inset on every side; child just draws
<div className="shrink-0 px-4 pt-10">{/* header zone */}</div>
<main className="flex min-h-0 flex-1 flex-col gap-6 px-4 pb-10">
  <RouteView />
</main>

// bad: child pads its own bottom against the edge
<main className="flex min-h-0 flex-1 flex-col px-4">
  <ScrollFade className="min-h-0 flex-1 pb-10">{/* child owns edge inset */}</ScrollFade>
</main>
```

For a scroll region the host pads around the `ScrollFade`, so the trailing room
sits below the scroller and not inside it.

## Radius and type: pick from the scale, never inline a value

One radius family, one step off square, picked from the scale and never
inlined. The mapping and values are in
[DESIGN-SYSTEM.md](../packages/ui/DESIGN-SYSTEM.md)'s radius table.

Any `text-[Npx]` is rejected, with one standing exception: relative `em` sizing
inside prose and markdown rendering, where the size is intentionally
proportional to a parent that varies by call site.

## The window grid

Columns, handles and the footer are areas of **one** CSS grid at persisted
widths clamped on read, never nested flex containers, so hiding or resizing a
column is one template declaration and nothing inside it has to know. Which
columns exist, and what each is allowed to do, is
[navigation.md](navigation.md)'s.

The top bar is rendered outside the window grid. Its centred layout uses equal
flexible outer columns around the brand. Page breadcrumbs remain in their owning
pane and do not determine top-bar sizing.

The overlay slots are grid children, not siblings above the grid. An overlay
that must float without taking layout spans its row and is
`pointer-events-none` at its root, re-enabling events on the panel itself; an
overlay that must cover the work area spans main and everything right of it,
never the session sidebar.

## Layout: fixed-height shell, scroll on content

Each pane is a fixed-height column that hides its own overflow; only an inner
region scrolls. The pane itself never scrolls.

```tsx
<div className="flex h-full flex-col overflow-hidden">
  <div className="shrink-0">{/* header zone: sticky context */}</div>
  <ScrollFade className="min-h-0 flex-1">{/* body zone: scrolls */}</ScrollFade>
</div>
```

The header zone (`shrink-0`) never scrolls away; the body (`flex-1 min-h-0`) is
the only scroll region, and `min-h-0` is what lets overflow land there instead
of on the pane. A sub-section with its own header repeats the split. Each view
owns its own `ScrollFade`; never wrap the whole pane in one global scroller,
that forces every view's header through the same mask.

## Scroll edges fade, never hard-cut

Every scroll region is wrapped in `ScrollFade` from `@goodboy/ui`. Raw
`overflow-y-auto` is forbidden. The viewport hides its native scrollbar, so the
gradient is the only affordance that a region scrolls.

**Give it a bounded height**: `min-h-0 flex-1` inside a flex column, or a
`max-h-*` on the root. A root with no height constraint does not error, it
renders as an unbounded list, which is why this regresses silently.

**The header must sit outside the fade.** The gradients are absolutely
positioned overlays painted above the viewport, so a `sticky` header inside the
scroller is veiled as soon as the region scrolls; an opaque `bg-*` does not
save it, because the overlay paints over the header, not under it. The fix is
structural: titles, breadcrumbs, toolbars and error banners live in a
`shrink-0` zone outside, only the body is wrapped.

## Dividers between regions, never container borders

Separators between regions (panes, sidebar sections, toolbar groups, dialog
blocks) use `<Divider>` from `@goodboy/ui`, rendered as a sibling. Never a
`border-t/-r/-b/-l` on a container acting as a divider. Borders that define a
control's own shape are fine.

## A dialog is the last resort, not the default

Anything belonging to a control opens anchored to it, as a `Popover` portaled
to `document.body` and positioned off the trigger's `getBoundingClientRect()`.
One hook owns the whole mechanism: fixed coordinates, backdrop, portal, Escape,
and the flip above the trigger when the space below runs out. Reach for it
rather than hand-rolling any piece. A centred
overlay for a menu with an obvious on-screen owner is a bug, not a style
choice. Two things a hand-rolled case gets wrong silently: paint nothing until
the first measurement, or the panel flashes at `0,0`; recompute on `scroll`
with capture `true`, since a scroll in any ancestor moves the trigger.

**Confirmations never open a dialog.** A destructive action swaps its own row
or button for `InlineConfirm`, so the thing being destroyed stays visible while
the user decides.

**`Dialog` survives for the three cases an anchor cannot serve**: a full-screen
viewer, a multi-step flow that owns the whole screen, and a blocking system
prompt. Everything else is a popover or inline.

## z-index: a named scale, not a magic number per file

App-global transient overlays (the ones that must win against every full-page
surface, because their trigger stays visible and clickable no matter what is
open underneath) use named tokens from `styles.css`' `@theme` block, under
`--z-index-*`: Tailwind v4 turns each key into a `z-<name>` utility. The values
are in [DESIGN-SYSTEM.md](../packages/ui/DESIGN-SYSTEM.md); the order is
`StudioShell` fullscreen, then `popover-backdrop`, `popover`,
`command-palette`, `tooltip`, `toast`, with a native `<dialog>` above all of
them in the browser's top layer.

That order is a precedence chain, not taste: each rung must clear the one under
it because it can be opened while that one is still up. **A control earns a
name here only when its trigger stays clickable under a fullscreen studio**, so
it can be opened while that studio is up. The footer's popovers qualify,
because the studio leaves the bars clickable. Anything narrower keeps the
nearest local `z-10`..`z-40`, scoped to one card, toolbar or pane and never
compared against a full-page studio. That is why the footer builds its own
popover rather than raising the shared one over every pane menu that uses it:
raising the shared one would promote every consumer at once.

## An expanded row is one group, not two

A disclosure (header plus the body it reveals) is a single surface. The
container owns the border and the open background, the header sits inside it
with no border of its own, and the body continues under the same rail with no
gap between the two. A second bordered shell below the header, or a `gap-*`
between header and body, reads as two unrelated components the moment the row
opens. Nothing inside the body draws its own box: a labelled section is a `2xs`
uppercase muted label plus its content, never a nested card.
