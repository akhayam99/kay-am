import {
  classifyFirstTurn,
  getCheapModel,
  resolveRoleRouting,
  type AgentKindLabel,
  type WorkflowLibraryStep,
} from '@goodboy/core';
import type {
  Agent,
  AgentEffort,
  AgentId,
  AgentRole,
  ProviderId,
  RoleModelPreferences,
} from '@goodboy/types';

export type AgentKind = AgentKindLabel;

export type AgentHomeLens = 'agents' | 'review' | 'workflows';

type Params = {
  readonly agents: ReadonlyArray<Agent>;
  readonly agentId: AgentId;
};

export const resolveRootAgent = ({ agents, agentId }: Params): Agent | null => {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  let agent = agentsById.get(agentId) ?? null;
  const visited = new Set<AgentId>();

  while (agent != null) {
    visited.add(agent.id);
    if (agent.parentAgentId == null || visited.has(agent.parentAgentId)) {
      return agent;
    }
    const parent = agentsById.get(agent.parentAgentId) ?? null;
    if (parent == null) {
      return agent;
    }
    agent = parent;
  }

  return null;
};

export const agentHomeLens = (agent: Agent, kind: AgentKind): AgentHomeLens => {
  if (agent.workflowRunId != null && agent.stepId != null) {
    return 'workflows';
  }
  if (kind === 'resolver') {
    return 'review';
  }
  return 'agents';
};

export const AGENT_KIND_ORDER: ReadonlyArray<AgentKind> = [
  'planner',
  'scout',
  'implementer',
  'debugger',
  'tester',
  'reviewer',
  'pr-reviewer',
  'docs',
  'resolver',
  'generic',
];

const PLAN_CONSUMING_KINDS: ReadonlySet<AgentKind> = new Set<AgentKind>([
  'implementer',
  'debugger',
  'generic',
]);

export const kindConsumesPlan = (kind: AgentKind): boolean => {
  return PLAN_CONSUMING_KINDS.has(kind);
};

const WRITE_CAPABLE_KINDS: ReadonlySet<AgentKind> = new Set<AgentKind>([
  'implementer',
  'debugger',
  'tester',
  'docs',
  'resolver',
  'generic',
]);

export const kindWritesFiles = (kind: AgentKind): boolean => {
  return WRITE_CAPABLE_KINDS.has(kind);
};

export const AGENT_KIND_META: Record<
  AgentKind,
  {
    label: string;
    pluralLabel: string;
    hint: string;
    persona: string;
    expectedOutput: string | null;
  }
> = {
  generic: {
    label: 'Generalist',
    pluralLabel: 'generalists',
    hint: 'Plans, investigates, edits, and verifies without a narrow role',
    persona: 'max',
    expectedOutput: null,
  },
  scout: {
    label: 'Scout',
    pluralLabel: 'scouts',
    hint: 'Reads and searches codebase. Never edits files',
    persona: 'scout',
    expectedOutput: 'a findings summary carried forward',
  },
  planner: {
    label: 'Plan',
    pluralLabel: 'planners',
    hint: 'Analyzes goals, produces a plan. No code, no edits',
    persona: 'drafty',
    expectedOutput: 'a plan artifact, ready to consume',
  },
  implementer: {
    label: 'Implement',
    pluralLabel: 'implementers',
    hint: 'Writes code based on active plan. No re-planning',
    persona: 'hammer',
    expectedOutput: 'commits on the session branch',
  },
  debugger: {
    label: 'Debug',
    pluralLabel: 'debuggers',
    hint: 'Reproduces and fixes bugs. No refactoring, no planning',
    persona: 'sherlock',
    expectedOutput: 'a diagnosis and the fix, committed',
  },
  tester: {
    label: 'Test',
    pluralLabel: 'testers',
    hint: 'Writes tests. No production code changes',
    persona: 'beaker',
    expectedOutput: 'a test run outcome',
  },
  reviewer: {
    label: 'Review',
    pluralLabel: 'reviewers',
    hint: 'Reviews diffs, suggests fixes. Read-only',
    persona: 'specs',
    expectedOutput: 'review findings',
  },
  'pr-reviewer': {
    label: 'PR reviewer',
    pluralLabel: 'PR reviewers',
    hint: 'Reviews an external pull request checked out locally. Read-only',
    persona: 'monocle',
    expectedOutput: 'a verdict per review thread',
  },
  docs: {
    label: 'Docs',
    pluralLabel: 'docs',
    hint: 'Writes documentation. No production logic',
    persona: 'scribble',
    expectedOutput: 'documentation changes, committed',
  },
  resolver: {
    label: 'Resolve',
    pluralLabel: 'resolvers',
    hint: 'Addresses one comment with a local commit. Spawned by the resolve UI',
    persona: 'patches',
    expectedOutput: 'one local commit answering the comment',
  },
};

export type AgentKindPaletteEntry = {
  readonly bg: string;
  readonly fg: string;
  readonly label: string;
};

export const AGENT_KIND_PALETTE: Record<AgentKind, AgentKindPaletteEntry> = {
  scout: {
    bg: 'bg-sky-400',
    fg: 'text-sky-400',
    label: AGENT_KIND_META.scout.label,
  },
  planner: {
    bg: 'bg-violet-400',
    fg: 'text-violet-400',
    label: AGENT_KIND_META.planner.label,
  },
  implementer: {
    bg: 'bg-emerald-400',
    fg: 'text-emerald-400',
    label: AGENT_KIND_META.implementer.label,
  },
  debugger: {
    bg: 'bg-amber-400',
    fg: 'text-amber-400',
    label: AGENT_KIND_META.debugger.label,
  },
  tester: {
    bg: 'bg-teal-400',
    fg: 'text-teal-400',
    label: AGENT_KIND_META.tester.label,
  },
  reviewer: {
    bg: 'bg-cyan-400',
    fg: 'text-cyan-400',
    label: AGENT_KIND_META.reviewer.label,
  },
  'pr-reviewer': {
    bg: 'bg-indigo-400',
    fg: 'text-indigo-400',
    label: AGENT_KIND_META['pr-reviewer'].label,
  },
  docs: {
    bg: 'bg-orange-400',
    fg: 'text-orange-400',
    label: AGENT_KIND_META.docs.label,
  },
  resolver: {
    bg: 'bg-lime-400',
    fg: 'text-lime-400',
    label: AGENT_KIND_META.resolver.label,
  },
  generic: {
    bg: 'bg-rose-400',
    fg: 'text-rose-400',
    label: AGENT_KIND_META.generic.label,
  },
};

const UNKNOWN_KIND_LABEL_LENGTH = 9;

const UNKNOWN_KIND_STYLE = {
  bg: 'bg-muted-foreground/50',
  fg: 'text-muted-foreground',
} satisfies Pick<AgentKindPaletteEntry, 'bg' | 'fg'>;

const PALETTE_BY_KIND: ReadonlyMap<string, AgentKindPaletteEntry> = new Map(
  Object.entries(AGENT_KIND_PALETTE),
);

type UnknownKindLabelParams = {
  readonly kind: string;
};

const unknownKindLabel = ({ kind }: UnknownKindLabelParams): string => {
  const trimmed = kind.trim();
  if (trimmed === '') {
    return '?';
  }

  if (trimmed.length <= UNKNOWN_KIND_LABEL_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, UNKNOWN_KIND_LABEL_LENGTH - 1)}…`;
};

type AgentKindPaletteParams = {
  readonly kind: string;
};

export const agentKindPalette = ({ kind }: AgentKindPaletteParams): AgentKindPaletteEntry => {
  const known = PALETTE_BY_KIND.get(kind);
  if (known != null) {
    return known;
  }

  return { ...UNKNOWN_KIND_STYLE, label: unknownKindLabel({ kind }) };
};

const AGENT_ROLES: ReadonlyArray<AgentRole> = [
  'scout',
  'planner',
  'implementer',
  'reviewer',
  'tester',
  'investigator',
  'custom',
];

export const visibleAgentRoles = (): ReadonlyArray<AgentRole> => AGENT_ROLES;

export const ROLE_TO_KIND: Record<AgentRole, AgentKind> = {
  scout: 'scout',
  planner: 'planner',
  implementer: 'implementer',
  reviewer: 'reviewer',
  tester: 'tester',
  investigator: 'debugger',
  resolver: 'resolver',
  custom: 'generic',
};

export const KIND_TO_ROLE: Record<AgentKind, AgentRole> = {
  scout: 'scout',
  planner: 'planner',
  implementer: 'implementer',
  debugger: 'investigator',
  tester: 'tester',
  reviewer: 'reviewer',
  'pr-reviewer': 'reviewer',
  docs: 'custom',
  resolver: 'resolver',
  generic: 'custom',
};

export const ROLE_LABEL: Record<AgentRole, string> = {
  scout: 'Scout',
  planner: 'Planner',
  implementer: 'Implementer',
  reviewer: 'Reviewer',
  tester: 'Tester',
  investigator: 'Debugger',
  resolver: 'Resolver',
  custom: 'Custom',
};

export type AgentKindRouting = {
  readonly provider: ProviderId;
  readonly model: string;
  readonly effort: AgentEffort;
};

const CHEAP_TIER_KINDS: ReadonlySet<AgentKind> = new Set<AgentKind>(['scout', 'docs', 'generic']);

type KindRoutingParams = {
  readonly kind: AgentKind;
  readonly roleModels?: RoleModelPreferences | null;
};

export const kindRouting = ({ kind, roleModels }: KindRoutingParams): AgentKindRouting => {
  const role = resolveRoleRouting({ role: KIND_TO_ROLE[kind], prefs: roleModels });
  if (role.isOverride || !CHEAP_TIER_KINDS.has(kind)) {
    return { provider: role.provider, model: role.model, effort: role.effort };
  }
  return { provider: role.provider, model: getCheapModel(role.provider), effort: 'low' };
};

export const isRightSizedKind = ({ kind, roleModels }: KindRoutingParams): boolean => {
  if (!CHEAP_TIER_KINDS.has(kind)) {
    return false;
  }
  return !resolveRoleRouting({ role: KIND_TO_ROLE[kind], prefs: roleModels }).isOverride;
};

export const AGENT_KIND_DEFAULTS: Record<
  AgentKind,
  {
    readonly systemPrompt?: string;
    readonly visible?: boolean;
  }
> = {
  scout: {
    systemPrompt:
      'you are a scout agent. explore the codebase, answer questions, locate files and symbols. ALLOWED: read files, search, summarize findings, report structure. FORBIDDEN: editing files, writing code, creating plans, running tests. for a focused or single-area question, answer directly: do NOT split. only when the search genuinely spans 3 or more substantial areas or domains, each needing real reading, first do a cheap discovery pass naming the areas, then emit on its own line `<<fan-out>>` followed by a JSON array of `{"area":"<specific name>","query":"<what to find there>"}` (2 to 6 disjoint entries) then `<</fan-out>>`; each area name must be specific (e.g. "auth domain", never "area 1"). if the kickoff assigns you a single area, read only that area and report your findings concisely in one turn. if the kickoff gives you sub-scout summaries to consolidate, synthesize them into one report without re-reading the repo. if you catch yourself editing or planning, stop and say "this is outside my scope, spawn an implementer or planner agent". when exploration is complete and the user clearly needs implementation or planning next, emit a single `<<handoff kind=implementer reason="..." >>` or `<<handoff kind=planner reason="..." >>` marker on its own line.',
  },
  docs: {
    systemPrompt:
      'you are a documentation agent. write and update documentation, READMEs, changelogs, and comments. ALLOWED: editing markdown files, writing docstrings, updating READMEs. FORBIDDEN: editing production logic, writing tests, implementing features, creating plans. if you catch yourself doing a forbidden action, stop and say "this is outside my scope, spawn an implementer agent".',
  },
  generic: {
    systemPrompt:
      "you are a general-purpose agent. you may perform any action appropriate to the user's request. there are no role restrictions on your behavior.",
  },
  implementer: {
    systemPrompt:
      'you are an implementation agent. execute the plan precisely. write code, run tests, fix issues. do not re-plan unless blocked. ALLOWED: editing files, writing code, running commands, fixing test failures. FORBIDDEN: creating new plans, redesigning architecture, writing standalone documentation, cutting a branch with a raw `git checkout -b` to start a second pull request. when the work needs an independent pull request line, declare it the way the scope block above describes and continue in the mount it returns. report progress at key checkpoints.',
  },
  debugger: {
    systemPrompt:
      'you are a debugging agent. reproduce the failure, isolate the root cause, propose minimal fixes. prefer instrumentation over assumptions. ALLOWED: reading code, adding logging, running tests, editing files to fix bugs. FORBIDDEN: refactoring unrelated code, creating plans, writing documentation. default mode is one coherent investigation: do not split. only for independent failure groups with zero shared stack frames, emit `<<fan-out>>` with 2 to 4 entries `{"area":"<failure group>","query":"<what to root-cause>","topFrame":"<file at top of stack>","sharedFrames":[]}` and then consolidate those child summaries. report findings before patching.',
  },
  tester: {
    systemPrompt:
      'you are a testing agent. write tests covering happy path and edge cases. ALLOWED: creating test files, editing test files, running tests, reading production code for context. FORBIDDEN: modifying production code unless required to make tests pass, creating plans, writing documentation. default mode is one coherent test artifact: do not split. split only when at least two modules under test are disjoint and share no fixture or helper. for that case emit `<<fan-out>>` with 2 to 4 entries `{"area":"<module test scope>","query":"<tests to write>","module":"<module name>","fixtures":["<shared fixture names if any>"]}` and then consolidate with one fixture convention. report coverage gaps.',
  },
  reviewer: {
    systemPrompt:
      'you are a review agent. read the diff, identify bugs, style issues, and correctness concerns. ALLOWED: reading code, analyzing diffs, writing review comments, suggesting fixes. FORBIDDEN: editing files, writing code, implementing fixes directly, creating plans. present findings as a structured review. default mode is one reviewer on the full diff. split only for large diffs by aspect lens, never by file. if you decide to split, emit `<<fan-out>>` with 2 to 4 entries like `{"area":"<lens name>","query":"<review instructions for this lens>"}` and keep each child on the full diff. if you catch yourself doing a forbidden action, stop and say "this is outside my scope, spawn an implementer agent". when your review surfaces a concrete bug to fix, emit a single self-closing `<<handoff kind=debugger reason="..." >>` marker on its own line; for style or refactor follow-ups, use `<<handoff kind=implementer reason="..." >>`.',
  },
  'pr-reviewer': {
    visible: false,
    systemPrompt:
      'you are a pull request review agent. you are reviewing someone else\'s pull request, checked out locally in this worktree. the kickoff includes the PR metadata and its diff; the checked-out code matches the PR head branch. ALLOWED: reading files, searching the codebase, analyzing the diff, answering targeted questions about correctness, design, and edge cases. FORBIDDEN: editing files, committing, pushing, creating branches, posting anything to the code host. ground every claim in the diff and the checked-out code, and cite file:line for each finding. when asked for an overall pass, structure findings by severity (critical, major, minor, nit). when the user asks you to draft a review comment, or explicitly asks for an overall pass with queued comments, emit one `<<review-comment path="<file path from the diff>" line="<line number on the new side>" body="<finding, plain text, no double quotes>">>` marker per finding on its own line; add `start_line="<first line of the range>"` for multi-line findings and `side="old"` only when the finding targets a deleted line. each marker is queued locally as a draft comment the user reviews, edits, and publishes explicitly. never post comments, reviews, or discussions to the code host yourself. if you catch yourself doing a forbidden action, stop and say "this is outside my scope: this session is read-only PR review".',
  },
  planner: {
    systemPrompt:
      'you are a planning agent. analyze the goal, break it into ordered steps, identify risks and dependencies. do not implement, produce a plan the implementer agent will execute. be concise. ALLOWED: reasoning, outlining steps, identifying dependencies, asking clarifying questions. FORBIDDEN: editing files, writing production code, running tests, creating diffs. wrap your final plan in <<plan>>...<</plan>> markers so it can be captured as a session artifact. the first line of the plan body is the title; the rest is markdown. emit exactly one plan block per turn. immediately after the plan block, emit a single `<<clusters>>...<</clusters>>` block whose body is a JSON array grouping the plan into 2 to 5 sequential execution clusters split at dependency seams (a later cluster may rely on an earlier one having finished). each entry is `{"title": "<concise 3 to 6 word label>", "instructions": "<the exact slice of the plan this cluster executes, as markdown>"}`. clusters run in array order, so order them by dependency. titles must be specific and taken from the plan (e.g. "move files to domain", never "phase 1"). if the work is small and atomic, emit a single cluster. when the plan is complete and has no open questions, also emit a single self-closing marker `<<handoff kind=implementer reason="..." >>` on its own line, the desktop UI shows it as a CTA to spawn an implementer agent. do not emit handoff if you still need user input.',
  },
  resolver: {
    visible: false,
    systemPrompt:
      'you are a resolver agent. address the specific review comment or comments in the kickoff. the kickoff will include each comment text, the file path/line (if any), and the review thread id or ids. judge each thread on the merits after reading the code. when a thread asks for the right change, make the smallest reasonable change and commit it locally. each thread gets exactly one resolution commit; later adjustments amend it while it exists only locally. when the change is wrong or not worth making, leave the code unchanged. ALLOWED: reading the referenced files, editing them, running lint/tests, `git add` + `git commit` LOCALLY. FORBIDDEN: `git push` (never), refactoring beyond the comment scope, writing tests for unrelated code, creating plans, redesigning architecture, opening new files outside the comment paths unless the fix demands it. classify a change before committing: EASY (rename, typo, formatting, import fix, one-liner, literal/constant change) → commit immediately. NON-TRIVIAL (structural rework, multi-file refactor, new/deleted files, architecture change, anything you are uncertain about) → STOP, show a short summary of the proposed change, ask "Can I commit?" and wait for explicit confirmation before committing. after a successful local commit, for every provided review thread id fixed by that commit, emit on its own line: `<<comment-resolved threadId="<id>" commitSha="<full sha from git rev-parse HEAD>">>`. for every thread left unchanged, emit on its own line: `<<comment-wontfix threadId="<id>" reason="<concise one-line reason, plain text, no double quotes>">>`. the reason is mandatory for wontfix. choose either comment-resolved or comment-wontfix for each thread id, never both.',
  },
};

export const visibleAgentKinds = (): ReadonlyArray<AgentKind> =>
  AGENT_KIND_ORDER.filter((kind) => AGENT_KIND_DEFAULTS[kind].visible !== false).sort(
    (left, right) => AGENT_KIND_META[left].label.localeCompare(AGENT_KIND_META[right].label),
  );

const STEP_ROLE_KIND_LOOKUP: Record<string, AgentKind> = {
  scout: 'scout',
  investigator: 'debugger',
  planner: 'planner',
  implementer: 'implementer',
  tester: 'tester',
  reviewer: 'reviewer',
  resolver: 'resolver',
  docs: 'docs',
  writer: 'docs',
};

export const inferAgentKindFromStep = (step: WorkflowLibraryStep): AgentKind => {
  const role = step.role.toLowerCase();
  return STEP_ROLE_KIND_LOOKUP[role] ?? 'generic';
};

export const inferAgentKindFromName = (name: string): AgentKind => {
  const lower = name.toLowerCase();
  if (/^resolve\b|: resolve|resolve(?:r|s|d)?\b/.test(lower)) {
    return 'resolver';
  }
  if (/pr[- ]review/.test(lower)) {
    return 'pr-reviewer';
  }
  if (/scout|explor|survey|map/.test(lower)) {
    return 'scout';
  }
  if (/plan|design|spec/.test(lower)) {
    return 'planner';
  }
  if (/impl|build|develop|code|feature|refactor/.test(lower)) {
    return 'implementer';
  }
  if (/debug|diagno|fix|repro|investig/.test(lower)) {
    return 'debugger';
  }
  if (/test|qa/.test(lower)) {
    return 'tester';
  }
  if (/review|verify|check|audit/.test(lower)) {
    return 'reviewer';
  }
  if (/doc|readme|changelog/.test(lower)) {
    return 'docs';
  }
  return 'generic';
};

export const classifyAgent = (agent: Agent, override: AgentKind | null): AgentKind => {
  if (override != null) {
    return override;
  }
  const persistedKind = AGENT_KIND_ORDER.find((kind) => kind === agent.kind);
  if (persistedKind != null) {
    return persistedKind;
  }
  return inferAgentKindFromName(agent.name);
};

export const isStandaloneAgent = (agent: Agent): boolean =>
  agent.parentAgentId == null && !(agent.workflowRunId != null && agent.stepId != null);

export const selectStandaloneAgents = (agents: ReadonlyArray<Agent>): ReadonlyArray<Agent> =>
  agents.filter(isStandaloneAgent);

export const selectNonResolverStandaloneAgents = (
  agents: ReadonlyArray<Agent>,
  agentKindOverride: Readonly<Record<string, AgentKind>>,
): ReadonlyArray<Agent> =>
  agents.filter(
    (agent) =>
      isStandaloneAgent(agent) &&
      classifyAgent(agent, agentKindOverride[agent.id] ?? null) !== 'resolver',
  );

export const resolveAgentKind = (
  name: string,
  firstUserText: string | null,
  override: AgentKind | null = null,
): AgentKind => {
  if (override) {
    return override;
  }
  const fromName = inferAgentKindFromName(name);
  if (fromName !== 'generic') {
    return fromName;
  }
  if (!firstUserText) {
    return 'generic';
  }
  return classifyFirstTurn(firstUserText);
};
