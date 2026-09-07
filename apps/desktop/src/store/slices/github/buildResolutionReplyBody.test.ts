import { describe, expect, it } from 'vitest';
import { buildResolutionReplyBody } from './buildResolutionReplyBody';

const PR_URL = 'https://github.com/o/r/pull/9';

describe('buildResolutionReplyBody', () => {
  it('returns null without a closure', () => {
    expect(
      buildResolutionReplyBody({ closure: undefined, prUrl: PR_URL, isAttributed: false }),
    ).toBeNull();
  });

  it('labels a fix and puts the resolution below the reason', () => {
    const body = buildResolutionReplyBody({
      closure: { commitSha: 'abc1234def', reply: 'the guard ran after the early return' },
      prUrl: PR_URL,
      isAttributed: false,
    });
    expect(body).toBe(
      '**Valid.** the guard ran after the early return\n\n**Resolution.** Fixed in [`abc1234`](https://github.com/o/r/commit/abc1234def).',
    );
  });

  it('keeps the plain commit line when the pr url is unknown', () => {
    expect(
      buildResolutionReplyBody({
        closure: { commitSha: 'abc1234def' },
        prUrl: null,
        isAttributed: false,
      }),
    ).toBe('**Valid.**\n\n**Resolution.** Fixed in `abc1234`.');
  });

  it('labels a close and names the closing reason', () => {
    expect(
      buildResolutionReplyBody({
        closure: {
          reason: 'covered elsewhere',
          reply: 'the sibling routes share this convention',
        },
        prUrl: PR_URL,
        isAttributed: false,
      }),
    ).toBe(
      '**Not applying.** the sibling routes share this convention\n\n**Resolution.** Closed without a change: covered elsewhere',
    );
  });

  it('stands on the verdict alone when the agent wrote no reason', () => {
    expect(
      buildResolutionReplyBody({
        closure: { reason: 'covered elsewhere' },
        prUrl: PR_URL,
        isAttributed: false,
      }),
    ).toBe('**Not applying.**\n\n**Resolution.** Closed without a change: covered elsewhere');
  });

  it('posts the reply unlabelled when there is no sha and no reason', () => {
    expect(
      buildResolutionReplyBody({
        closure: { reply: 'answered inline' },
        prUrl: PR_URL,
        isAttributed: false,
      }),
    ).toBe('answered inline');
  });

  it('returns null when every field is blank', () => {
    expect(
      buildResolutionReplyBody({
        closure: { reply: '   ', reason: '' },
        prUrl: PR_URL,
        isAttributed: false,
      }),
    ).toBeNull();
  });

  it('signs the reply when attribution is enabled', () => {
    expect(
      buildResolutionReplyBody({
        closure: { reply: 'answered inline' },
        prUrl: PR_URL,
        isAttributed: true,
      }),
    ).toBe(`answered inline\n\n*Written by Goodboy*`);
  });

  it('leaves a blank closure unsigned when attribution is enabled', () => {
    expect(
      buildResolutionReplyBody({
        closure: { reply: '   ', reason: '' },
        prUrl: PR_URL,
        isAttributed: true,
      }),
    ).toBeNull();
  });
});
