# Iconography

> **Read this when** you are about to put a glyph on a surface, or you are
> unsure which glyph a concept already owns. **Not for** color tokens
> (`packages/ui/DESIGN-SYSTEM.md`) or spacing mechanics (`docs/styling.md`).

One meaning, one glyph. The registry in
[`apps/desktop/src/shared/components/conceptIcons.ts`](../apps/desktop/src/shared/components/conceptIcons.ts)
is the contract: `CONCEPT_ICONS` maps a concept to its glyph, `CONCEPT_TONE`
maps the same concept to its tone, and `ICON_SIZE` gives the only three sizes
the app draws with. This document is the readable face of that file. When they
disagree, the file is wrong and gets fixed, not the document.

Rules that hold everywhere:

- Lucide only. Brand marks come from `@goodboy/ui` (`GithubIcon`, `GitlabIcon`,
  `LinearIcon`, `JiraIcon`, `SentryIcon`, `SlackIcon`, `BitbucketIcon`) or from
  `IntegrationGlyph`, never from a lucide look-alike.
- `Sparkles`, `Sparkle`, `Wand2` and `WandSparkles` are banned by
  `apps/desktop/src/__tests__/regressions/no-ai-sparkle-glyphs.test.ts`. An AI
  affordance names its concept (`orchestrator`, `enhance`, `suggestion`,
  `autorun`, `agents`) instead of shrugging at a sparkle.
- Spinners are banned. Loading is a skeleton, running is a pulsing `StatusDot`.
  That is why the run-state family below has no glyph for `running`.
- An icon-only control carries a `Tooltip`, enforced by
  `icon-only-controls-carry-a-tooltip.test.ts`.
- Emoji never appear in the UI.

## Sizes

Three tokens, exported from `conceptIcons.ts`:

| Token               | px  | Use                                                    |
| ------------------- | --- | ------------------------------------------------------ |
| `ICON_SIZE.row`     | 13  | Leading and trailing glyphs inside list and table rows |
| `ICON_SIZE.control` | 14  | Buttons, menu triggers, rail tabs, form adornments     |
| `ICON_SIZE.hero`    | 18  | Empty states, studio headers, choice tiles             |

Sizes below the row token (8 to 11 px) stay literal: they belong to chips,
badges and status dots, where the glyph is a mark inside a shape rather than a
row of its own.

`apps/desktop/src/__tests__/regressions/icon-size-uses-a-token.test.ts` fails on
any 12 to 18 px literal under `features/` and `app/`. Every feature area has
been through the token pass; the allowlist holds the single genuine exception
(an HTML `input size` attribute in characters). A new exception needs a reason
in the allowlist entry, never a directory-wide waiver.

## Navigation lenses

`LENS_ICON` in `features/session/lens-labels.ts` reads straight from the
registry, so a lens never picks its own glyph. Size is `control` in the lens
switcher and rail tabs.

| Lens                  | Concept          | Glyph                   | Tone    |
| --------------------- | ---------------- | ----------------------- | ------- |
| Questions             | `questions`      | `CircleHelp`            | warning |
| Agents                | `agents`         | `Bot`                   | primary |
| Workflows             | `workflows`      | `Waypoints`             | accent  |
| Review                | `review`         | `MessageSquareDiff`     | primary |
| Plans                 | `plans`          | `ClipboardList`         | draft   |
| Scripts               | `scripts`        | `ListVideo`             | info    |
| Terminal              | `terminal`       | `SquareTerminal`        | neutral |
| Context               | `context`        | `Brain`                 | info    |
| Goal                  | `goal`           | `Target`                | primary |
| Decisions             | `decisions`      | `CheckCheck`            | success |
| Session summary       | `sessionSummary` | `NotebookText`          | info    |
| GitHub                | `pr`             | `GitPullRequest`        | primary |
| Diff                  | `diff`           | `FileDiff`              | info    |
| Explore               | `explore`        | `FolderSearch`          | info    |
| GitHub issue          | `issues`         | `CircleDot`             | info    |
| Linear, Sentry, Jira, | brand concepts   | `@goodboy/ui` brand set | primary |

## Session stages

Stages are drawn as a `StatusDot` on the board: the dot carries the stage, the
glyph is only for surfaces that explain the stage in prose. `SESSION_STAGE_ICON`
in `features/session/session-stage.ts` owns that mapping and is consumed by the
stage board section of the guide.

| Stage       | Glyph         | Tone    |
| ----------- | ------------- | ------- |
| `attention` | `CircleHelp`  | warning |
| `running`   | `CirclePlay`  | info    |
| `review`    | `Eye`         | success |
| `building`  | `Hammer`      | neutral |
| `done`      | `CircleCheck` | merged  |

## Agent kinds

Agent kinds do **not** take a lucide glyph. Their identity is the mascot plus
the per-kind color in `shared/components/AgentAvatar`, backed by
`AGENT_KIND_PALETTE` in `features/session/agent-kind.ts`. A second glyph system
for the same ten kinds (`generic`, `scout`, `planner`, `implementer`,
`debugger`, `tester`, `reviewer`, `pr-reviewer`, `docs`, `resolver`) would
compete with it. Use `AgentAvatar`.

## Run states

| State     | Concept        | Glyph          | Tone    | Used by                                              |
| --------- | -------------- | -------------- | ------- | ---------------------------------------------------- |
| pending   | `runPending`   | `CircleDashed` | neutral | `AgentStatusIcon`                                    |
| running   | none           | pulsing dot    | info    | `StatusDot tone="info" pulsing`                      |
| done      | `runDone`      | `CircleCheck`  | success | `AgentStatusIcon`, run status                        |
| failed    | `runFailed`    | `CircleX`      | danger  | `AgentStatusIcon`                                    |
| cancelled | `runCancelled` | `CircleSlash`  | neutral | `AgentStatusIcon` (skipped), discarded workflow runs |

## Projects, mounts and git objects

| Concept         | Glyph               | Tone    | Meaning                                     |
| --------------- | ------------------- | ------- | ------------------------------------------- |
| `projectRepo`   | `FolderGit2`        | info    | A project whose kind is `repo`              |
| `projectFolder` | `Folder`            | neutral | A project whose kind is `folder`            |
| `mount`         | `Layers2`           | info    | A project mounted into a session            |
| `worktree`      | `FolderTree`        | neutral | The session folder on disk                  |
| `workspace`     | `FolderPlus`        | info    | A workspace                                 |
| `branch`        | `GitBranch`         | info    | A branch, and the branch chip               |
| `commits`       | `GitCommit`         | info    | Commits                                     |
| `timeline`      | `GitCommitVertical` | neutral | The activity rail                           |
| `pr`            | `GitPullRequest`    | primary | Pull and merge requests                     |
| `diff`          | `FileDiff`          | info    | A diff, and the changes cell of a mount row |
| `folderOpen`    | `FolderOpen`        | neutral | Reveal the worktree in the OS               |

`projectGlyph({ kind })` in `conceptIcons.ts` is the single place that decides
between the repo and the folder glyph. Never re-derive it inline.

## Integrations and providers

Brand marks only, never a lucide stand-in: `github`, `gitlab`, `bitbucket`,
`linear`, `jira`, `sentry`, `slack` resolve to the `@goodboy/ui` brand
components. The footer strip renders them through `IntegrationGlyph`, in brand
color when the integration is connected and muted otherwise. `providers`
(`Blocks`) and `integrations` (`Link2`) name the categories, not a vendor.

## Actions

| Concept        | Glyph                   | Tone    | Affordance                       |
| -------------- | ----------------------- | ------- | -------------------------------- |
| `rename`       | `SquarePen`             | neutral | Rename an agent, workflow, title |
| `archive`      | `Archive`               | neutral | Archive a session                |
| `restore`      | `ArchiveRestore`        | neutral | Unarchive a session              |
| `delete`       | `Trash2`                | danger  | Destructive delete               |
| `folderOpen`   | `FolderOpen`            | neutral | Reveal a path in the OS          |
| `openExternal` | `SquareArrowOutUpRight` | neutral | Open on the code host            |
| `terminal`     | `SquareTerminal`        | neutral | Open a terminal                  |
| `scripts`      | `ListVideo`             | info    | Open scripts                     |
| `more`         | `Ellipsis`              | neutral | Overflow menu trigger            |
| `search`       | `SearchX`               | info    | Empty search result              |

`Ellipsis` replaced the deprecated `MoreHorizontal` alias on every overflow
trigger in the migrated areas.

## Timeline markers

`TimelineRowMarker` sizes every glyph from `TIMELINE_RHYTHM.grade[grade]`, not
from `ICON_SIZE`: rail markers scale with row grade. The glyph itself still
comes from the registry through `sessionEventGlyph`.

| Entry           | Glyph                                     |
| --------------- | ----------------------------------------- |
| Plan            | `plans`                                   |
| Open question   | `questions`                               |
| Answered        | `MessageSquareCheck`                      |
| Branch artifact | `branch`                                  |
| Session folder  | `worktree`                                |
| Project mounted | `mount`                                   |
| Pull request    | `PULL_REQUEST_PRESENTATION` per state     |
| Workflow        | `workflows`, `delete` when deleted        |
| Decisions       | `decisions`                               |
| Issue           | `IntegrationGlyph` for the issue provider |

## Suggestions

One map, `SUGGESTION_ICONS` in `features/suggestions/suggestionIcons.ts`,
shared by the suggestion row and the timeline suggestion row. They used to
disagree on four of six kinds.

| Kind                 | Concept     | Glyph                |
| -------------------- | ----------- | -------------------- |
| `workflow-next-step` | `nextSteps` | `ArrowRight`         |
| `plan-ready`         | `plans`     | `ClipboardList`      |
| `resolve-threads`    | `resolve`   | `MessageSquareReply` |
| `rebase-project`     | `branch`    | `GitBranch`          |
| `answer-questions`   | `questions` | `CircleHelp`         |
| `mount-project`      | `mount`     | `Layers2`            |

## Scripts and inbox

Script categories own their glyphs in `SCRIPT_CATEGORIES`
(`features/scripts/classifyScript.ts`): `dev` `Play`, `build` `Hammer`, `test`
`FlaskConical`, `lint` `SearchCheck`, `typecheck` `ShieldCheck`, `format`
`Brush`, `db` `Database`, `generate` `FileCode2`, `install` `Package`, `deploy`
`Rocket`, `clean` `Trash2`, `docs` `BookOpen`, `other` `Terminal`. Import that
list, never restate it.

Inbox row kinds own theirs in `InboxRow.tsx`: `issue` `CircleDot`, `pr` and
`mr` `GitPullRequest`, `thread` `MessagesSquare`, `error` `Bug`, each at
`ICON_SIZE.control` with the state tone.
