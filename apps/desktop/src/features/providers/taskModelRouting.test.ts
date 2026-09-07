import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATION_COOLDOWN_MS,
  cooldownWindowEnd,
  RATE_LIMIT_COOLDOWN_MS,
  USAGE_LIMIT_COOLDOWN_MS,
  withFailureCooldown,
  withProviderCooldown,
} from './taskModelRouting';

const NOW = 1_800_000_000_000;

describe('withProviderCooldown', () => {
  it('keeps the longer of the stored window and the new one', () => {
    const next = withProviderCooldown({
      cooldowns: { anthropic: NOW + 3_600_000 },
      provider: 'anthropic',
      resetAtMs: NOW + 60_000,
    });

    expect(next.anthropic).toBe(NOW + 3_600_000);
  });

  it('extends a shorter stored window', () => {
    const next = withProviderCooldown({
      cooldowns: { anthropic: NOW + 60_000 },
      provider: 'anthropic',
      resetAtMs: NOW + 3_600_000,
    });

    expect(next.anthropic).toBe(NOW + 3_600_000);
  });

  it('replaces a window that has already expired', () => {
    const next = withProviderCooldown({
      cooldowns: { anthropic: Date.now() - 1_000 },
      provider: 'anthropic',
      resetAtMs: null,
    });

    expect(next.anthropic).toBeGreaterThan(Date.now());
  });
});

describe('withFailureCooldown', () => {
  it('uses the parsed reset time when the usage limit carries one', () => {
    const next = withFailureCooldown({
      cooldowns: {},
      provider: 'anthropic',
      failure: { kind: 'usage_limit', resetAtMs: NOW + 7_200_000 },
      nowMs: NOW,
    });

    expect(next.anthropic).toBe(NOW + 7_200_000);
  });

  it('falls back to the usage-limit window when no reset time is parsed', () => {
    const next = withFailureCooldown({
      cooldowns: {},
      provider: 'anthropic',
      failure: { kind: 'usage_limit' },
      nowMs: NOW,
    });

    expect(next.anthropic).toBe(NOW + USAGE_LIMIT_COOLDOWN_MS);
  });

  it('records a short window for a rate limit', () => {
    const next = withFailureCooldown({
      cooldowns: {},
      provider: 'codex',
      failure: { kind: 'rate_limit' },
      nowMs: NOW,
    });

    expect(next.codex).toBe(NOW + RATE_LIMIT_COOLDOWN_MS);
  });

  it('records a window for an authentication failure', () => {
    const next = withFailureCooldown({
      cooldowns: {},
      provider: 'gemini',
      failure: { kind: 'authentication' },
      nowMs: NOW,
    });

    expect(next.gemini).toBe(NOW + AUTHENTICATION_COOLDOWN_MS);
  });

  it('leaves the cooldowns untouched for a failure the pool cannot help with', () => {
    const cooldowns = { anthropic: NOW + 1_000 };
    const next = withFailureCooldown({
      cooldowns,
      provider: 'anthropic',
      failure: { kind: 'other' },
      nowMs: NOW,
    });

    expect(next).toBe(cooldowns);
  });

  it('does not shorten a longer window set by an agent turn', () => {
    const next = withFailureCooldown({
      cooldowns: { anthropic: NOW + 5 * 60 * 60 * 1000 },
      provider: 'anthropic',
      failure: { kind: 'usage_limit' },
      nowMs: NOW,
    });

    expect(next.anthropic).toBe(NOW + 5 * 60 * 60 * 1000);
  });
});

describe('cooldownWindowEnd', () => {
  it('returns the furthest active window', () => {
    expect(
      cooldownWindowEnd({
        cooldowns: { anthropic: NOW + 1_000, codex: NOW + 9_000, gemini: NOW - 1_000 },
        nowMs: NOW,
      }),
    ).toBe(NOW + 9_000);
  });

  it('returns nothing when no window is active', () => {
    expect(cooldownWindowEnd({ cooldowns: { anthropic: NOW - 1 }, nowMs: NOW })).toBeNull();
  });
});
