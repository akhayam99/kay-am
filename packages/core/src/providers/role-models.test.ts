import { describe, expect, it, vi } from 'vitest';
import type { ProviderId, RoleModelPreferences } from '@goodboy/types';
import { ROLE_DEFAULTS } from '../roles';
import { resolveRoleRouting } from './role-models';

describe('resolveRoleRouting', () => {
  it('resolves a role with no stored preference to its compiled default', () => {
    expect(resolveRoleRouting({ role: 'investigator', prefs: null })).toEqual({
      provider: ROLE_DEFAULTS.investigator.provider,
      model: ROLE_DEFAULTS.investigator.model,
      effort: ROLE_DEFAULTS.investigator.effort,
      isOverride: false,
    });
  });

  it('prefers a valid stored preference over the compiled default', () => {
    const prefs: RoleModelPreferences = {
      investigator: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
    };

    expect(resolveRoleRouting({ role: 'investigator', prefs })).toEqual({
      provider: 'anthropic',
      model: 'opus-5',
      effort: 'max',
      isOverride: true,
    });
  });

  it('falls back when the stored model is unknown to the provider', () => {
    const prefs: RoleModelPreferences = {
      reviewer: { providerId: 'anthropic', model: 'claude-opus-99', effort: 'high' },
    };
    const resolved = resolveRoleRouting({ role: 'reviewer', prefs });

    expect(resolved.model).toBe(ROLE_DEFAULTS.reviewer.model);
    expect(resolved.isOverride).toBe(false);
  });

  it('falls back when the stored provider is unknown to the registry', () => {
    const prefs: RoleModelPreferences = {
      reviewer: { providerId: 'ollama' as ProviderId, model: 'llama-4', effort: 'high' },
    };
    const resolved = resolveRoleRouting({ role: 'reviewer', prefs });

    expect(resolved.provider).toBe(ROLE_DEFAULTS.reviewer.provider);
    expect(resolved.model).toBe(ROLE_DEFAULTS.reviewer.model);
    expect(resolved.isOverride).toBe(false);
  });

  it('keeps the pinned model and defaults the effort when the ladder omits it', () => {
    const prefs: RoleModelPreferences = {
      reviewer: { providerId: 'anthropic', model: 'claude-sonnet-4-6', effort: 'max' },
    };
    const resolved = resolveRoleRouting({ role: 'reviewer', prefs });

    expect(resolved.model).toBe('sonnet-4.6');
    expect(resolved.effort).toBe('high');
    expect(resolved.isOverride).toBe(true);
  });

  it('keeps a pin on a model that has no effort ladder at all', () => {
    const prefs: RoleModelPreferences = {
      investigator: { providerId: 'anthropic', model: 'claude-haiku-4-5', effort: 'low' },
    };
    const resolved = resolveRoleRouting({ role: 'investigator', prefs });

    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('haiku-4.5');
    expect(resolved.isOverride).toBe(true);
  });

  it('takes the top of the ladder when neither the stored nor the role effort fits', () => {
    const prefs: RoleModelPreferences = {
      planner: { providerId: 'codex', model: 'gpt-5.4-mini', effort: 'max' },
    };
    const resolved = resolveRoleRouting({ role: 'planner', prefs });

    expect(resolved.model).toBe('gpt-5.4-mini');
    expect(resolved.effort).toBe('xhigh');
    expect(resolved.isOverride).toBe(true);
  });

  it('ignores a preference stored for a different role', () => {
    const prefs: RoleModelPreferences = {
      planner: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'low' },
    };
    const resolved = resolveRoleRouting({ role: 'tester', prefs });

    expect(resolved.model).toBe(ROLE_DEFAULTS.tester.model);
    expect(resolved.isOverride).toBe(false);
  });

  it('resolves the resolver role to its compiled default with no stored preference', () => {
    expect(resolveRoleRouting({ role: 'resolver', prefs: null })).toEqual({
      provider: ROLE_DEFAULTS.resolver.provider,
      model: ROLE_DEFAULTS.resolver.model,
      effort: ROLE_DEFAULTS.resolver.effort,
      isOverride: false,
    });
  });

  it('gives the resolver role its own pin and fallback, not the custom one', () => {
    const prefs: RoleModelPreferences = {
      custom: { providerId: 'anthropic', model: 'claude-haiku-4-5', effort: 'low' },
      resolver: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'codex', model: 'gpt-5.6' },
      },
    };
    const resolved = resolveRoleRouting({ role: 'resolver', prefs });

    expect(resolved.model).toBe('opus-5');
    expect(resolved.effort).toBe('high');
    expect(resolved.isOverride).toBe(true);
    expect(resolved.fallback).toEqual({ provider: 'codex', model: 'gpt-5.6', effort: 'high' });
  });

  it('leaves the resolver on its compiled default when only the custom role is pinned', () => {
    const prefs: RoleModelPreferences = {
      custom: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
    };
    const resolved = resolveRoleRouting({ role: 'resolver', prefs });

    expect(resolved.model).toBe(ROLE_DEFAULTS.resolver.model);
    expect(resolved.isOverride).toBe(false);
  });

  it('leaves the fallback absent when the role has no stored preference', () => {
    expect(resolveRoleRouting({ role: 'planner', prefs: null }).fallback).toBeUndefined();
  });

  it('leaves the fallback absent when the preference stores none', () => {
    const prefs: RoleModelPreferences = {
      planner: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'high' },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs }).fallback).toBeUndefined();
  });

  it('resolves a stored fallback and inherits the primary effort', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'codex', model: 'gpt-5.6' },
      },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs }).fallback).toEqual({
      provider: 'codex',
      model: 'gpt-5.6',
      effort: 'high',
    });
  });

  it('inherits the clamped primary effort, not the stored one', () => {
    const prefs: RoleModelPreferences = {
      reviewer: {
        providerId: 'anthropic',
        model: 'claude-sonnet-4-6',
        effort: 'max',
        fallback: { providerId: 'codex', model: 'gpt-5.6' },
      },
    };
    const resolved = resolveRoleRouting({ role: 'reviewer', prefs });

    expect(resolved.effort).toBe('high');
    expect(resolved.fallback?.effort).toBe('high');
  });

  it('prefers an explicit fallback effort over the inherited one', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'codex', model: 'gpt-5.6', effort: 'low' },
      },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs }).fallback?.effort).toBe('low');
  });

  it('clamps a fallback effort the fallback model cannot reach', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'codex', model: 'gpt-5.4-mini', effort: 'max' },
      },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs }).fallback).toEqual({
      provider: 'codex',
      model: 'gpt-5.4-mini',
      effort: 'xhigh',
    });
  });

  it('normalizes a fallback stored under its legacy cli id', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'claude-haiku-4-5' },
      },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs }).fallback?.model).toBe('haiku-4.5');
  });

  it('drops a fallback whose model the catalogue does not know, keeping the pin', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'claude-opus-99' },
      },
    };
    const resolved = resolveRoleRouting({ role: 'planner', prefs });

    expect(resolved.fallback).toBeUndefined();
    expect(resolved.model).toBe('opus-5');
    expect(resolved.isOverride).toBe(true);
  });

  it('drops a fallback whose provider is unknown to the registry, keeping the pin', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        effort: 'high',
        fallback: { providerId: 'ollama' as ProviderId, model: 'llama-4' },
      },
    };
    const resolved = resolveRoleRouting({ role: 'planner', prefs });

    expect(resolved.fallback).toBeUndefined();
    expect(resolved.model).toBe('opus-5');
    expect(resolved.isOverride).toBe(true);
  });

  it('drops the fallback along with a pin the registry rejects', () => {
    const prefs: RoleModelPreferences = {
      planner: {
        providerId: 'anthropic',
        model: 'claude-opus-99',
        effort: 'high',
        fallback: { providerId: 'codex', model: 'gpt-5.6' },
      },
    };
    const resolved = resolveRoleRouting({ role: 'planner', prefs });

    expect(resolved.isOverride).toBe(false);
    expect(resolved.fallback).toBeUndefined();
  });

  it('routes an unknown role through the custom preference, like the compiled default does', () => {
    const prefs: RoleModelPreferences = {
      custom: { providerId: 'codex', model: 'gpt-5.6', effort: 'high' },
    };

    expect(resolveRoleRouting({ role: 'emperor', prefs })).toEqual({
      provider: 'codex',
      model: 'gpt-5.6',
      effort: 'high',
      isOverride: true,
    });
  });

  it('preserves an explicit codex variant', () => {
    const prefs: RoleModelPreferences = {
      planner: { providerId: 'codex', model: 'gpt-5.6-luna', effort: 'high' },
    };

    expect(resolveRoleRouting({ role: 'planner', prefs })).toEqual({
      provider: 'codex',
      model: 'gpt-5.6-luna',
      effort: 'high',
      isOverride: true,
    });
  });

  it('warns instead of silently dropping an invalid role preference', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const prefs: RoleModelPreferences = {
      reviewer: { providerId: 'anthropic', model: 'claude-opus-99', effort: 'high' },
    };

    const resolved = resolveRoleRouting({ role: 'reviewer', prefs });

    expect(resolved).toMatchObject({
      provider: ROLE_DEFAULTS.reviewer.provider,
      model: ROLE_DEFAULTS.reviewer.model,
      isOverride: false,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid reviewer model'));
    warn.mockRestore();
  });
});
