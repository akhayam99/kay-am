import type { AgentRole, TaskModelPreference } from '@goodboy/types';
import { extractAuxOutput } from '../providers/aux-output';
import { runAuxOneShot } from '../providers/aux-spawn';
import { getDefaultBinary } from '../providers/cli-defaults';
import { isAgentRole } from '../roles';

const WORKFLOW_FORMAT_SYSTEM_PROMPT = `You design multi-step AI coding workflows. Each step runs as its own dedicated agent, in order, left to right.

You receive a plain-language description of a desired workflow, plus the current draft steps (if any). Produce a clean, ordered set of steps.

Rules:
- Match the language of the DESIRED WORKFLOW description for all text fields (name, description, goal, step names, promptPrefix, expectedOutput, suggestions). If the description is written in Italian, write every field in Italian; same for any other language. Keep role values from the canonical list unchanged.
- 2 to 6 steps. Each step has a single clear responsibility; do not bundle "plan and implement" into one step.
- name: a short verb or noun (e.g. "Scout", "Plan", "Implement", "Review"). Title case, no numbering.
- role: one of scout, planner, implementer, reviewer, investigator, tester, custom. Pick the closest fit; use custom only when none apply.
- promptPrefix: a direct instruction to that step's agent. Imperative voice. State what to do and what NOT to do (e.g. "do not write code yet"). One to three sentences.
- expectedOutput: one sentence describing the artifact this step hands to the next.
- Order steps so each depends only on prior outputs.

Also propose a workflow name (kebab-or-short phrase), a one-line description, a one-sentence goal stating the overall objective the workflow works toward (shared with every step), and up to 3 short suggestions for how the user could improve the workflow further.

Output ONLY a single marker block, nothing before or after:
<<workflow>>
{"name":"...","description":"...","goal":"...","steps":[{"name":"...","role":"...","promptPrefix":"...","expectedOutput":"..."}],"suggestions":["..."]}
<</workflow>>

The block must contain valid JSON. No markdown fences, no comments, no trailing prose.`;

export type FormattedWorkflowStep = {
  readonly name: string;
  readonly role: AgentRole;
  readonly promptPrefix: string;
  readonly expectedOutput: string;
};

export type FormattedWorkflow = {
  readonly name: string;
  readonly description: string;
  readonly goal?: string;
  readonly steps: ReadonlyArray<FormattedWorkflowStep>;
  readonly suggestions: ReadonlyArray<string>;
};

export type WorkflowFormatInput = {
  readonly description: string;
  readonly currentName?: string;
  readonly currentDescription?: string;
  readonly currentStepNames?: ReadonlyArray<string>;
};

export type WorkflowFormatDeps = TaskModelPreference & {
  readonly binary?: string;
  readonly workingDir?: string;
  readonly invokeFn: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
};

type FormatParams = {
  readonly deps: WorkflowFormatDeps;
  readonly input: WorkflowFormatInput;
};

export const buildWorkflowFormatUserPrompt = (input: WorkflowFormatInput): string => {
  const lines = ['DESIRED WORKFLOW (plain language):', input.description.trim(), ''];
  const hasCurrent =
    (input.currentName ?? '').trim().length > 0 ||
    (input.currentDescription ?? '').trim().length > 0 ||
    (input.currentStepNames ?? []).length > 0;
  if (hasCurrent) {
    lines.push('CURRENT DRAFT (rewrite or refine this):');
    if ((input.currentName ?? '').trim().length > 0) {
      lines.push(`name: ${input.currentName!.trim()}`);
    }
    if ((input.currentDescription ?? '').trim().length > 0) {
      lines.push(`description: ${input.currentDescription!.trim()}`);
    }
    const steps = (input.currentStepNames ?? []).filter((s) => s.trim().length > 0);
    if (steps.length > 0) {
      lines.push('steps:');
      lines.push(...steps.map((s) => `- ${s.trim()}`));
    }
    lines.push('');
  }
  lines.push('Produce the cleaned workflow as the single <<workflow>> marker block.');
  return lines.join('\n');
};

export const formatWorkflowFromNL = async ({
  deps,
  input,
}: FormatParams): Promise<FormattedWorkflow | null> => {
  const description = input.description.trim();
  if (description.length === 0) {
    return null;
  }

  const result = await runAuxOneShot({
    providerId: deps.providerId,
    model: deps.model,
    ...(deps.effort != null && { effort: deps.effort }),
    binary: deps.binary ?? getDefaultBinary(deps.providerId),
    userMessage: buildWorkflowFormatUserPrompt(input),
    systemPrompt: WORKFLOW_FORMAT_SYSTEM_PROMPT,
    ...(deps.workingDir != null && { workingDir: deps.workingDir }),
    invokeFn: deps.invokeFn,
  });
  if ((result.exitCode ?? 0) !== 0) {
    return null;
  }

  const text = extractAuxOutput({ providerId: deps.providerId, stdout: result.stdout }).text;
  return parseFormattedWorkflow(text);
};

const WORKFLOW_MARKER_OPEN = '<<workflow>>';
const WORKFLOW_MARKER_CLOSE = '<</workflow>>';

export const parseFormattedWorkflow = (text: string): FormattedWorkflow | null => {
  const raw = extractMarkerBody(text) ?? text;
  const json = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    const obj = extractJsonObject(json);
    if (obj === null) {
      return null;
    }
    try {
      parsed = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const o = parsed as Record<string, unknown>;
  const stepsRaw = Array.isArray(o.steps) ? o.steps : [];
  const steps: FormattedWorkflowStep[] = [];
  for (const entry of stepsRaw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (name.length === 0) {
      continue;
    }
    const roleRaw = typeof e.role === 'string' ? e.role.trim().toLowerCase() : 'custom';
    const role = isAgentRole(roleRaw) ? roleRaw : 'custom';
    const promptPrefix = typeof e.promptPrefix === 'string' ? e.promptPrefix.trim() : '';
    const expectedOutput = typeof e.expectedOutput === 'string' ? e.expectedOutput.trim() : '';
    steps.push({ name, role, promptPrefix, expectedOutput });
  }
  if (steps.length === 0) {
    return null;
  }

  const suggestionsRaw = Array.isArray(o.suggestions) ? o.suggestions : [];
  const suggestions = suggestionsRaw
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);

  const goal = typeof o.goal === 'string' ? o.goal.trim() : '';

  return {
    name: typeof o.name === 'string' ? o.name.trim() : '',
    description: typeof o.description === 'string' ? o.description.trim() : '',
    ...(goal.length > 0 && { goal }),
    steps,
    suggestions,
  };
};

function extractMarkerBody(text: string): string | null {
  let body: string | null = null;
  let from = 0;
  for (;;) {
    const open = text.indexOf(WORKFLOW_MARKER_OPEN, from);
    if (open === -1) {
      break;
    }
    const contentStart = open + WORKFLOW_MARKER_OPEN.length;
    const close = text.indexOf(WORKFLOW_MARKER_CLOSE, contentStart);
    if (close === -1) {
      break;
    }
    const inner = text.slice(contentStart, close).trim();
    if (inner.length > 0) {
      body = inner;
    }
    from = close + WORKFLOW_MARKER_CLOSE.length;
  }
  return body;
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```') || trimmed.length < 6) {
    return trimmed;
  }
  let start = 3;
  if (trimmed.slice(start, start + 4).toLowerCase() === 'json') {
    start += 4;
  }
  return trimmed.slice(start, trimmed.length - 3).trim();
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}
