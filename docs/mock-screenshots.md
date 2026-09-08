# Mock screenshots

> **Read this when** you need a real-app screenshot with fake, advanced,
> non-empty state (for a social post, a README image, a deck). **Not for**
> testing (see `docs/testing.md`) or the rule that a post needs a screenshot
> at all (`goodboy-atlas/docs/autonomy/announcement.md`).

The rule for any published screenshot is: real components, fake data, never
an empty state, never real client or project names. Getting there the slow
way costs an afternoon. This is the fast way, learned once, in full.

## Do not run the Tauri desktop app

The instinct is to launch the real `.app` and drive it. Don't. Two problems
compound: launching a second instance fights the production build over
window focus and the same bundle identifier, and (unexplained, given up on
after exhausting every diagnostic) a Tauri dev build's WKWebView can keep
rendering stale content even after confirming, byte for byte via `curl`,
that the served source is correct. No root cause was found; the fix was to
stop using the desktop shell entirely.

Run `pnpm dev` in `apps/desktop` (starts the Vite dev server, port from
`tauri.conf.json`'s `devUrl`, currently 1421) and open that URL in an
ordinary browser. Nothing about the app's own code depends on the Tauri
runtime unless a component calls `invoke()` directly; the mock scenes below
never do, so this just works, and the browser's own devtools (console,
network, DOM) give visibility Tauri's webview does not.

## Turn on mock mode

- `apps/desktop/.env.local` (gitignored) must contain `VITE_GOODBOY_MOCK=1`.
  A shell-exported env var before `pnpm dev` is **not** picked up the same
  way; it has to be this file.
- `apps/desktop/src/store/mock-data.ts` exports `MOCK_ENABLED =
import.meta.env.VITE_GOODBOY_MOCK === '1' && import.meta.env.MODE !== 'test'`.
  The test-mode half is not optional: vitest reads the same `.env.local`, so
  without it every suite that renders `App` gets a mock scene instead and fails
  in a way that looks like a regression in the feature under test.
- `App.tsx` checks it as the literal first line of the `App` component body,
  before any hook: `if (MOCK_ENABLED) { return <MockScene />; }`. It has to
  be before the hooks, not after, or React's hook-count invariant breaks on
  the next hot-reload.
- `MockScene` (`apps/desktop/src/app/components/MockScene/`) reads a
  `?scene=` query param and renders one of several scene components, one per
  screenshot needed. Add a new scene by adding a file under `scenes/` and a
  line in the `SCENES` map.

## Reuse the real components, never rebuild the UI

Every scene should render the actual production component the feature uses,
fed fake props or fake store state. Rebuilding the visual by hand drifts
from the real app the moment either one changes, and it looks like it.

Two situations, and they need different tactics:

**The component is pure props.** `WorkflowStepGraph`, `ResolveBoard`,
`RoleModelRow` are like this: read the component's prop type, construct
matching fake data (real branded id casts, e.g. `'x' as Agent['id']`, real
enum values), pass it straight in. No store involved.

**The component reads the zustand store.** `SessionOverviewPane`,
`DefaultsPanel`, `SessionNavSidebar`, `AppFooter`'s enabling flags are like
this. `useAppStore` is a bare `create()` store: no `persist` middleware, no
Tauri-backed side effect on `setState`. That makes it safe to seed directly:

```tsx
useEffect(() => {
  useAppStore.setState({
    workspaces: [FAKE_WORKSPACE],
    sessions: [FAKE_SESSION],
    sessionGithub: { [FAKE_SESSION.id]: { pr: FAKE_PR, ... } },
    // every store key the component (and the hooks it calls) reads
    selectAgent: async () => undefined, // action functions can be stubbed too
  });
}, []);
```

The hard part is knowing which keys. Read the component's hook calls
(`useAppStore((s) => s.foo[id])`) and every hook it calls in turn, not just
the top-level props. A hook one level down needing a key you didn't seed
does not crash; it silently renders empty, which looks like a bug in the
component instead of a gap in the mock.

## Gotchas hit while building the five current scenes

- **The same "role" badge is computed two different ways depending on
  which component you're in.** `useWorkspaceRuns`'s `kindOf` reads
  `agent.kind` directly. `WorkflowStepGraphBranch`'s badge instead reads the
  `agentKindOverride` **prop** (keyed by agent id) and falls back to
  `inferAgentKindFromName(agent.name)`, ignoring `agent.kind` entirely.
  Setting `kind: 'implementer'` on the agent object did nothing there; the
  fix was populating `agentKindOverride={{ [id]: 'implementer', ... }}` on
  `WorkflowStepGraph` itself. Check the actual read site before assuming a
  field name carries across components.
- **`useWorkspaceRuns`'s Activity lane builds its workflow lookup from
  `state.phaseTemplates[workspaceId]`, not `state.sessionWorkflows`.**
  Seeding only `sessionWorkflows` (which `SessionOverviewPane`'s own
  `workflowById` union does read) leaves the Activity card empty. Seed both.
- **Provider/model routing badges** fall back to `run.modelOverride` /
  `run.providerOverride` on the `Agent` object when the
  `agentModelOverride`/`agentProviderOverride` prop maps are empty. Use real
  ids from `packages/core/src/providers/*/catalog.ts` (e.g. cursor's
  `composer-2.5-fast`, codex's `gpt-6-astra` or `gpt-5.6-sol`), not invented strings; the
  catalog is what `RoutingBadge` and the model picker resolve labels from.
- **Fan-out / sub-agents** render via `WorkflowStepGraph`'s
  `childrenByParentId: ReadonlyMap<string, ReadonlyArray<Agent>>` prop, keyed
  by the parent agent's id. The node shows a `doneChildCount/childCount`
  badge automatically; you don't compute or render that yourself.
- **Mounting `SessionNavSidebar` (or anything under it, like
  `SessionNavFooter`) standalone throws `useToast must be used inside
ToastProvider`.** The real app tree wraps everything in `ToastProvider`
  before `MockScene` would ever mount under the current `MOCK_ENABLED` gate,
  so `MockScene`'s own root has to wrap itself in `ToastProvider` too.
- **`AppShell` already has `leftSidebar` and `footer` slots.** No layout
  code is needed to add the real session sidebar or the real app footer to a
  scene; pass the components into those two props.

## Capture the actual image, not a browser-pane screenshot

An interactive browser pane's own screenshot tool adds its own chrome (a tab
badge, capture-indicator artifacts) and is capped to a scaled-down size. For
the file that actually gets committed and posted, shell out to headless
Chrome against the same localhost URL:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1440,900 --virtual-time-budget=4000 \
  --screenshot=out.png "http://localhost:1421/?scene=orchestrator"
```

`--window-size=1440,900` matches the Tauri window's fixed default size in
`tauri.conf.json`, so the crop matches what the real app looks like.
`--force-device-scale-factor=2` gives a retina image. `--virtual-time-budget`
gives the mock scene's `useEffect` time to seed the store and React time to
render before the snapshot is taken.

## Data hygiene

Fake workspace names, session goals, usernames, must be generic but
plausible, and never a real client, project, or person. Include at least one
"hard" task among the fake ones (a rate-limiting bug, a rounding bug), not
only trivial ones: an easy-looking task makes the product look like it's
only for easy tasks.

## What already exists

`apps/desktop/src/app/components/MockScene/` and
`apps/desktop/src/store/mock-data.ts` currently hold five scenes: board,
overview (with the full sidebar and footer), orchestrator (multi-provider
fan-out), resolve, and per-role model routing. As of this writing they are
uncommitted in a local worktree. They cost nothing at runtime when
`VITE_GOODBOY_MOCK` is unset, so committing them behind the flag (instead of
rebuilding from scratch next time) is worth doing the next time this comes
up.
