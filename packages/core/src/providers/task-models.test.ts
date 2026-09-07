import { describe, expect, it, vi } from 'vitest';
import { PROVIDER_IDS, type TaskModelPreferences } from '@goodboy/types';
import { PROVIDER_CAPABILITIES } from './capabilities';
import { getCheapModel } from './cli-defaults';
import { resolveTaskModel } from './task-models';

describe('resolveTaskModel', () => {
  it('returns a valid stored preference', () => {
    const prefs: TaskModelPreferences = {
      summarizer: { providerId: 'anthropic', model: 'claude-haiku-4-5' },
    };

    expect(
      resolveTaskModel({
        task: 'summarizer',
        preferences: prefs,
        workspaceDefaultProviderId: 'codex',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'anthropic',
      model: 'haiku-4.5',
    });
  });

  it('keeps a stored effort alongside the model', () => {
    const prefs: TaskModelPreferences = {
      workflow_orchestrator: {
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        effort: 'high',
      },
    };

    expect(
      resolveTaskModel({
        task: 'workflow_orchestrator',
        preferences: prefs,
        workspaceDefaultProviderId: 'anthropic',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'anthropic',
      model: 'sonnet-4.6',
      effort: 'high',
    });
  });

  it('uses the default provider cheap model when no preference exists', () => {
    expect(
      resolveTaskModel({
        task: 'branch_naming',
        preferences: null,
        workspaceDefaultProviderId: 'anthropic',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'anthropic',
      model: 'haiku-4.5',
    });
  });

  it('falls back when the stored model does not belong to its provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prefs: TaskModelPreferences = {
      plan_generation: {
        providerId: 'anthropic',
        model: 'not-a-model',
      },
    };

    expect(
      resolveTaskModel({
        task: 'plan_generation',
        preferences: prefs,
        workspaceDefaultProviderId: 'codex',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'codex',
      model: 'gpt-5.4-mini',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid plan_generation model'));
    warn.mockRestore();
  });

  it('uses a mid model for anthropic rebase tasks', () => {
    expect(
      resolveTaskModel({
        task: 'rebase',
        preferences: null,
        workspaceDefaultProviderId: 'anthropic',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'anthropic',
      model: 'sonnet-5',
    });
  });

  it('uses the first turn-tier model for other rebase providers', () => {
    expect(
      resolveTaskModel({
        task: 'rebase',
        preferences: null,
        workspaceDefaultProviderId: 'codex',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({
      providerId: 'codex',
      model: 'gpt-5.6',
    });
  });

  it('decides orchestration on a mid model, never on the cheap one', () => {
    const anthropic = resolveTaskModel({
      task: 'workflow_orchestrator',
      preferences: null,
      workspaceDefaultProviderId: 'anthropic',
      sessionDefaultProviderId: 'anthropic',
    });
    const codex = resolveTaskModel({
      task: 'workflow_orchestrator',
      preferences: null,
      workspaceDefaultProviderId: 'codex',
      sessionDefaultProviderId: 'anthropic',
    });

    expect(anthropic).toEqual({ providerId: 'anthropic', model: 'sonnet-5' });
    expect(codex).toEqual({ providerId: 'codex', model: 'gpt-5.4' });
    expect(anthropic.model).not.toBe(getCheapModel('anthropic'));
    expect(codex.model).not.toBe(getCheapModel('codex'));
  });

  it('picks a mid model for every provider', () => {
    for (const providerId of PROVIDER_IDS) {
      const resolved = resolveTaskModel({
        task: 'workflow_orchestrator',
        preferences: null,
        workspaceDefaultProviderId: providerId,
        sessionDefaultProviderId: 'anthropic',
      });
      const descriptor = PROVIDER_CAPABILITIES[providerId].models.find(
        (model) => model.id === resolved.model,
      );

      expect(descriptor?.costTier).toBe('mid');
    }
  });

  it('prefers the current workspace provider over a captured session provider', () => {
    expect(
      resolveTaskModel({
        task: 'summarizer',
        preferences: null,
        workspaceDefaultProviderId: 'codex',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.4-mini' });
  });

  it('preserves an explicit codex model variant', () => {
    const preferences: TaskModelPreferences = {
      summarizer: { providerId: 'codex', model: 'gpt-5.6-terra', effort: 'high' },
    };

    expect(
      resolveTaskModel({
        task: 'summarizer',
        preferences,
        workspaceDefaultProviderId: 'anthropic',
        sessionDefaultProviderId: 'anthropic',
      }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.6-terra', effort: 'high' });
  });
});
