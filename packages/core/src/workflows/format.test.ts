import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkflowFormatUserPrompt,
  formatWorkflowFromNL,
  parseFormattedWorkflow,
} from './format';
import type { WorkflowFormatDeps } from './format';

const validJson = JSON.stringify({
  name: 'plan-implement-review',
  description: 'Plan, build, then review.',
  steps: [
    { name: 'Plan', role: 'planner', promptPrefix: 'Plan it.', expectedOutput: 'A plan.' },
    { name: 'Build', role: 'implementer', promptPrefix: 'Build it.', expectedOutput: 'Code.' },
  ],
  suggestions: ['Add a test step', 'Split the build step'],
});

describe('parseFormattedWorkflow', () => {
  it('extracts a marker block and parses its JSON', () => {
    const text = `here you go\n<<workflow>>\n${validJson}\n<</workflow>>\ntrailing`;
    const result = parseFormattedWorkflow(text);
    expect(result?.name).toBe('plan-implement-review');
    expect(result?.steps).toHaveLength(2);
    expect(result?.steps[0]).toMatchObject({ name: 'Plan', role: 'planner' });
    expect(result?.suggestions).toHaveLength(2);
  });

  it('falls back to bare JSON when no marker is present', () => {
    const result = parseFormattedWorkflow(validJson);
    expect(result?.steps).toHaveLength(2);
  });

  it('strips json fences inside the marker', () => {
    const text = '<<workflow>>\n```json\n' + validJson + '\n```\n<</workflow>>';
    const result = parseFormattedWorkflow(text);
    expect(result?.steps).toHaveLength(2);
  });

  it('recovers JSON embedded in surrounding prose', () => {
    const text = `sure: ${validJson} hope that helps`;
    const result = parseFormattedWorkflow(text);
    expect(result?.name).toBe('plan-implement-review');
  });

  it('coerces an unknown role to custom', () => {
    const json = JSON.stringify({
      steps: [{ name: 'Do', role: 'wizard', promptPrefix: '', expectedOutput: '' }],
    });
    const result = parseFormattedWorkflow(json);
    expect(result?.steps[0]?.role).toBe('custom');
  });

  it('drops steps without a name and returns null when none remain', () => {
    const json = JSON.stringify({ steps: [{ role: 'planner', promptPrefix: 'x' }] });
    expect(parseFormattedWorkflow(json)).toBeNull();
  });

  it('caps suggestions at three', () => {
    const json = JSON.stringify({
      steps: [{ name: 'Do', role: 'custom' }],
      suggestions: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(parseFormattedWorkflow(json)?.suggestions).toHaveLength(3);
  });

  it('returns null on non-JSON garbage', () => {
    expect(parseFormattedWorkflow('not json at all')).toBeNull();
  });

  it('parses the optional goal when present', () => {
    const json = JSON.stringify({
      goal: 'Ship the gitlab integration.',
      steps: [{ name: 'Do', role: 'custom', promptPrefix: 'x', expectedOutput: 'y' }],
    });
    expect(parseFormattedWorkflow(json)?.goal).toBe('Ship the gitlab integration.');
  });

  it('leaves goal undefined when absent or blank', () => {
    const withoutGoal = JSON.stringify({
      steps: [{ name: 'Do', role: 'custom', promptPrefix: 'x', expectedOutput: 'y' }],
    });
    expect(parseFormattedWorkflow(withoutGoal)?.goal).toBeUndefined();
    const blankGoal = JSON.stringify({
      goal: '   ',
      steps: [{ name: 'Do', role: 'custom', promptPrefix: 'x', expectedOutput: 'y' }],
    });
    expect(parseFormattedWorkflow(blankGoal)?.goal).toBeUndefined();
  });
});

describe('formatWorkflowFromNL', () => {
  const validMarker = `<<workflow>>\n${validJson}\n<</workflow>>`;

  function makeDeps(overrides: Partial<WorkflowFormatDeps> = {}): WorkflowFormatDeps {
    return {
      providerId: 'gemini',
      model: 'gemini-3.5-flash',
      invokeFn: vi.fn().mockResolvedValue({ stdout: validMarker, stderr: '', exitCode: 0 }),
      ...overrides,
    };
  }

  it('returns null for an empty description', async () => {
    const deps = makeDeps();
    const result = await formatWorkflowFromNL({ deps, input: { description: '   ' } });
    expect(result).toBeNull();
    expect(deps.invokeFn).not.toHaveBeenCalled();
  });

  it('returns null when the backend exits with a non-zero code', async () => {
    const deps = makeDeps({
      invokeFn: vi.fn().mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 }),
    });
    const result = await formatWorkflowFromNL({
      deps,
      input: { description: 'plan and build' },
    });
    expect(result).toBeNull();
  });

  it('parses the workflow from a valid marker response', async () => {
    const result = await formatWorkflowFromNL({
      deps: makeDeps(),
      input: { description: 'plan and build' },
    });
    expect(result?.name).toBe('plan-implement-review');
    expect(result?.steps).toHaveLength(2);
  });

  it('anthropic provider unwraps the {result} JSON envelope', async () => {
    const envelope = JSON.stringify({ result: validMarker });
    const deps = makeDeps({
      providerId: 'anthropic',
      invokeFn: vi.fn().mockResolvedValue({ stdout: envelope, stderr: '', exitCode: 0 }),
    });
    const result = await formatWorkflowFromNL({
      deps,
      input: { description: 'plan and build' },
    });
    expect(result?.steps).toHaveLength(2);
  });

  it('returns null when the backend returns malformed output', async () => {
    const deps = makeDeps({
      invokeFn: vi
        .fn()
        .mockResolvedValue({ stdout: 'not json and no marker', stderr: '', exitCode: 0 }),
    });
    const result = await formatWorkflowFromNL({
      deps,
      input: { description: 'plan and build' },
    });
    expect(result).toBeNull();
  });

  it('passes the configured model and effort to generation', async () => {
    const invokeFn = vi.fn().mockResolvedValue({
      stdout: validMarker,
      stderr: '',
      exitCode: 0,
    });
    const deps = makeDeps({
      providerId: 'codex',
      model: 'gpt-5.6-luna',
      effort: 'high',
      invokeFn,
    });

    await formatWorkflowFromNL({ deps, input: { description: 'plan and build' } });

    expect(invokeFn).toHaveBeenCalledWith(
      'summarize_session',
      expect.objectContaining({
        args: expect.objectContaining({
          providerId: 'codex',
          model: 'gpt-5.6-luna',
          effort: 'high',
        }),
      }),
    );
  });
});

describe('buildWorkflowFormatUserPrompt', () => {
  it('includes the description and the current draft when provided', () => {
    const prompt = buildWorkflowFormatUserPrompt({
      description: 'a review-heavy flow',
      currentName: 'old-name',
      currentStepNames: ['Scout', 'Plan'],
    });
    expect(prompt).toContain('a review-heavy flow');
    expect(prompt).toContain('CURRENT DRAFT');
    expect(prompt).toContain('old-name');
    expect(prompt).toContain('- Scout');
  });

  it('omits the draft section when there is nothing to refine', () => {
    const prompt = buildWorkflowFormatUserPrompt({ description: 'fresh workflow' });
    expect(prompt).not.toContain('CURRENT DRAFT');
  });
});
