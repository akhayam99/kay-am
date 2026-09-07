import { describe, expect, it, vi } from 'vitest';
import { getCheapModel } from '@goodboy/core';
import type { Workflow, WorkflowId } from '@goodboy/types';

const { formatWorkflowFromNLMock } = vi.hoisted(() => ({
  formatWorkflowFromNLMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return { ...actual, formatWorkflowFromNL: formatWorkflowFromNLMock };
});

import { startWorkflowGeneration } from './startWorkflowGeneration';

describe('startWorkflowGeneration', () => {
  it('saves an agent-drafted preset as custom', async () => {
    formatWorkflowFromNLMock.mockResolvedValue({
      name: 'Review and ship',
      description: 'Review the change, then ship it.',
      goal: 'Ship the change',
      steps: [
        {
          role: 'reviewer',
          name: 'Review',
          promptPrefix: 'Review the change',
          expectedOutput: 'Review findings',
        },
      ],
    });
    const saved = { id: 'wf-1' as WorkflowId } satisfies Partial<Workflow>;
    const savePhaseTemplate = vi.fn(async () => saved);
    const clearWorkflowStudioDraft = vi.fn();
    const state = {
      workflowGenerations: {},
      providers: [
        { id: 'anthropic', connection: 'connected' },
        { id: 'codex', connection: 'connected' },
      ],
      workspaceOverrides: {
        'ws-1': {
          defaultProviderId: 'anthropic',
          taskModels: {
            plan_generation: {
              providerId: 'codex',
              model: 'gpt-5.6-terra',
              effort: 'high',
            },
          },
        },
      },
      savePhaseTemplate,
      clearWorkflowStudioDraft,
    };
    const set = vi.fn((updater: (current: typeof state) => Partial<typeof state>) => {
      Object.assign(state, updater(state));
    });
    const generate = startWorkflowGeneration(set as never, (() => state) as never);

    const accepted = await generate({
      workspaceId: 'ws-1' as never,
      description: 'Review and ship this change',
      workflow: null,
      form: null,
    });

    expect(accepted).toBe(true);
    expect(savePhaseTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ isPreset: true, origin: 'custom' }),
    );
    expect(formatWorkflowFromNLMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deps: expect.objectContaining({
          providerId: 'codex',
          model: 'gpt-5.6-terra',
          effort: 'high',
        }),
      }),
    );
  });

  it('uses the first connected provider automatic model when no workspace default is set', async () => {
    formatWorkflowFromNLMock.mockResolvedValue({
      name: 'Review and ship',
      description: 'Review the change, then ship it.',
      goal: 'Ship the change',
      steps: [
        {
          role: 'reviewer',
          name: 'Review',
          promptPrefix: 'Review the change',
          expectedOutput: 'Review findings',
        },
      ],
    });
    const saved = { id: 'wf-2' as WorkflowId } satisfies Partial<Workflow>;
    const state = {
      workflowGenerations: {},
      providers: [{ id: 'codex', connection: 'connected' }],
      workspaceOverrides: {},
      savePhaseTemplate: vi.fn(async () => saved),
      clearWorkflowStudioDraft: vi.fn(),
    };
    const set = vi.fn((updater: (current: typeof state) => Partial<typeof state>) => {
      Object.assign(state, updater(state));
    });
    const generate = startWorkflowGeneration(set as never, (() => state) as never);

    await generate({
      workspaceId: 'ws-1' as never,
      description: 'Review and ship this change',
      workflow: null,
      form: null,
    });

    expect(formatWorkflowFromNLMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deps: expect.objectContaining({
          providerId: 'codex',
          model: getCheapModel('codex'),
        }),
      }),
    );
  });

  it('uses the workspace default automatic model when it is set and connected', async () => {
    formatWorkflowFromNLMock.mockResolvedValue({
      name: 'Review and ship',
      description: 'Review the change, then ship it.',
      goal: 'Ship the change',
      steps: [
        {
          role: 'reviewer',
          name: 'Review',
          promptPrefix: 'Review the change',
          expectedOutput: 'Review findings',
        },
      ],
    });
    const saved = { id: 'wf-3' as WorkflowId } satisfies Partial<Workflow>;
    const state = {
      workflowGenerations: {},
      providers: [
        { id: 'codex', connection: 'connected' },
        { id: 'anthropic', connection: 'connected' },
      ],
      workspaceOverrides: {
        'ws-1': { defaultProviderId: 'anthropic' },
      },
      savePhaseTemplate: vi.fn(async () => saved),
      clearWorkflowStudioDraft: vi.fn(),
    };
    const set = vi.fn((updater: (current: typeof state) => Partial<typeof state>) => {
      Object.assign(state, updater(state));
    });
    const generate = startWorkflowGeneration(set as never, (() => state) as never);

    await generate({
      workspaceId: 'ws-1' as never,
      description: 'Review and ship this change',
      workflow: null,
      form: null,
    });

    expect(formatWorkflowFromNLMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deps: expect.objectContaining({
          providerId: 'anthropic',
          model: getCheapModel('anthropic'),
        }),
      }),
    );
  });

  it('falls back to a connected provider when the workspace default is set but disconnected', async () => {
    formatWorkflowFromNLMock.mockResolvedValue({
      name: 'Review and ship',
      description: 'Review the change, then ship it.',
      goal: 'Ship the change',
      steps: [
        {
          role: 'reviewer',
          name: 'Review',
          promptPrefix: 'Review the change',
          expectedOutput: 'Review findings',
        },
      ],
    });
    const saved = { id: 'wf-4' as WorkflowId } satisfies Partial<Workflow>;
    const state = {
      workflowGenerations: {},
      providers: [{ id: 'codex', connection: 'connected' }],
      workspaceOverrides: {
        'ws-1': { defaultProviderId: 'anthropic' },
      },
      savePhaseTemplate: vi.fn(async () => saved),
      clearWorkflowStudioDraft: vi.fn(),
    };
    const set = vi.fn((updater: (current: typeof state) => Partial<typeof state>) => {
      Object.assign(state, updater(state));
    });
    const generate = startWorkflowGeneration(set as never, (() => state) as never);

    await generate({
      workspaceId: 'ws-1' as never,
      description: 'Review and ship this change',
      workflow: null,
      form: null,
    });

    expect(formatWorkflowFromNLMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deps: expect.objectContaining({
          providerId: 'codex',
          model: getCheapModel('codex'),
        }),
      }),
    );
  });
});
