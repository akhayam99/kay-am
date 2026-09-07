import { describe, expect, it } from 'vitest';
import type { OverrideSettings } from '@goodboy/types';
import { appendAttribution, ATTRIBUTION_TEXT, isAttributionEnabled } from './attribution';

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
  it('appends the markdown italic footer after a blank line', () => {
    expect(appendAttribution({ body: 'looks good', isEnabled: true, syntax: 'markdown' })).toBe(
      'looks good\n\n*Written by Goodboy*',
    );
  });

  it('appends the mrkdwn italic footer for slack', () => {
    expect(appendAttribution({ body: 'looks good', isEnabled: true, syntax: 'mrkdwn' })).toBe(
      'looks good\n\n_Written by Goodboy_',
    );
  });

  it('leaves the body untouched when disabled', () => {
    expect(appendAttribution({ body: 'looks good', isEnabled: false, syntax: 'markdown' })).toBe(
      'looks good',
    );
    expect(appendAttribution({ body: 'looks good', isEnabled: false, syntax: 'mrkdwn' })).toBe(
      'looks good',
    );
  });

  it('does not append twice for either syntax', () => {
    const markdown = appendAttribution({ body: 'looks good', isEnabled: true, syntax: 'markdown' });
    expect(appendAttribution({ body: markdown, isEnabled: true, syntax: 'markdown' })).toBe(
      markdown,
    );
    const mrkdwn = appendAttribution({ body: 'looks good', isEnabled: true, syntax: 'mrkdwn' });
    expect(appendAttribution({ body: mrkdwn, isEnabled: true, syntax: 'mrkdwn' })).toBe(mrkdwn);
  });

  it('recognizes a body already signed with the old plain line', () => {
    const signed = `looks good\n\n${ATTRIBUTION_TEXT}`;
    expect(appendAttribution({ body: signed, isEnabled: true, syntax: 'markdown' })).toBe(signed);
    expect(appendAttribution({ body: signed, isEnabled: true, syntax: 'mrkdwn' })).toBe(signed);
  });

  it('recognizes a body already signed with the other italic syntax', () => {
    const mrkdwnSigned = 'looks good\n\n_Written by Goodboy_';
    expect(appendAttribution({ body: mrkdwnSigned, isEnabled: true, syntax: 'markdown' })).toBe(
      mrkdwnSigned,
    );
    const markdownSigned = 'looks good\n\n*Written by Goodboy*';
    expect(appendAttribution({ body: markdownSigned, isEnabled: true, syntax: 'mrkdwn' })).toBe(
      markdownSigned,
    );
  });

  it('treats a body that is already only the footer as done', () => {
    expect(appendAttribution({ body: ATTRIBUTION_TEXT, isEnabled: true, syntax: 'markdown' })).toBe(
      ATTRIBUTION_TEXT,
    );
    expect(
      appendAttribution({
        body: '*Written by Goodboy*',
        isEnabled: true,
        syntax: 'markdown',
      }),
    ).toBe('*Written by Goodboy*');
  });

  it('normalizes trailing whitespace before appending', () => {
    expect(appendAttribution({ body: 'looks good\n\n', isEnabled: true, syntax: 'markdown' })).toBe(
      'looks good\n\n*Written by Goodboy*',
    );
  });

  it('returns the footer alone for an empty body', () => {
    expect(appendAttribution({ body: '   ', isEnabled: true, syntax: 'markdown' })).toBe(
      '*Written by Goodboy*',
    );
    expect(appendAttribution({ body: '   ', isEnabled: true, syntax: 'mrkdwn' })).toBe(
      '_Written by Goodboy_',
    );
  });
});
