import { describe, expect, it } from 'vitest';
import type { ResolveQueueRow } from './buildResolveQueueRows';
import { refuseBlockedReason } from './refuseBlockedReason';

const rowOf = ({ integratedSha }: { readonly integratedSha: string | null }): ResolveQueueRow =>
  ({ item: { id: 'item-1', integratedSha } }) as unknown as ResolveQueueRow;

describe('the refusal gate', () => {
  it('lets the owner refuse a comment no commit has answered yet', () => {
    expect(refuseBlockedReason({ row: rowOf({ integratedSha: null }) })).toBeNull();
  });

  it('names the integrated fix as the reason a refusal is no longer open', () => {
    expect(refuseBlockedReason({ row: rowOf({ integratedSha: 'abc1234' }) })).toBe(
      'Fix already integrated',
    );
  });
});
