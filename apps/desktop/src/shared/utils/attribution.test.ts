import { describe, expect, it } from 'vitest';
import type { OverrideSettings } from '@goodboy/types';
import { appendAttribution, ATTRIBUTION_FOOTER, isAttributionEnabled } from './attribution';

const overridesWith = (attributionFooter: boolean | null): OverrideSettings => ({
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter,
});

describe('isAttributionEnabled', () => {
  it('defaults to on when the workspace has no overrides', () => {
    expect(isAttributionEnabled({ overrides: null })).toBe(true);
    expect(isAttributionEnabled({ overrides: undefined })).toBe(true);
  });

  it('defaults to on when the override is unset', () => {
    expect(isAttributionEnabled({ overrides: overridesWith(null) })).toBe(true);
  });

  it('is off only when explicitly disabled', () => {
    expect(isAttributionEnabled({ overrides: overridesWith(false) })).toBe(false);
    expect(isAttributionEnabled({ overrides: overridesWith(true) })).toBe(true);
  });
});

describe('appendAttribution', () => {
  it('appends the footer after a blank line when enabled', () => {
    expect(appendAttribution({ body: 'looks good', isEnabled: true })).toBe(
      `looks good\n\n${ATTRIBUTION_FOOTER}`,
    );
  });

  it('leaves the body untouched when disabled', () => {
    expect(appendAttribution({ body: 'looks good', isEnabled: false })).toBe('looks good');
  });

  it('does not append twice', () => {
    const once = appendAttribution({ body: 'looks good', isEnabled: true });
    expect(appendAttribution({ body: once, isEnabled: true })).toBe(once);
  });

  it('treats a body that is already only the footer as done', () => {
    expect(appendAttribution({ body: ATTRIBUTION_FOOTER, isEnabled: true })).toBe(
      ATTRIBUTION_FOOTER,
    );
  });

  it('normalizes trailing whitespace before appending', () => {
    expect(appendAttribution({ body: 'looks good\n\n', isEnabled: true })).toBe(
      `looks good\n\n${ATTRIBUTION_FOOTER}`,
    );
  });

  it('returns the footer alone for an empty body', () => {
    expect(appendAttribution({ body: '   ', isEnabled: true })).toBe(ATTRIBUTION_FOOTER);
  });
});
