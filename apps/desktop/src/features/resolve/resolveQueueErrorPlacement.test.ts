import { describe, expect, it } from 'vitest';
import { resolveQueueErrorPlacement } from './resolveQueueErrorPlacement';

describe('where a resolve queue failure is shown', () => {
  it('shows nothing while the surface is healthy', () => {
    expect(resolveQueueErrorPlacement({ error: null, hasLoadedComments: true })).toBe('none');
  });

  it('takes the whole surface when the first load never landed', () => {
    expect(
      resolveQueueErrorPlacement({ error: 'GitHub unreachable', hasLoadedComments: false }),
    ).toBe('whole_surface');
  });

  it('stays inline when a later refresh fails over comments already on screen', () => {
    expect(
      resolveQueueErrorPlacement({ error: 'GitHub unreachable', hasLoadedComments: true }),
    ).toBe('inline');
  });
});
