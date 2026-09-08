import { describe, expect, it } from 'vitest';
import { verdictTally } from './verdictTally';
import type { ResolverThreadVerdictKind } from './resolverThreadVerdicts';

const verdict = ({
  kind,
  isClosed = false,
}: {
  readonly kind: ResolverThreadVerdictKind;
  readonly isClosed?: boolean;
}) => ({ kind, isClosed });

describe('verdictTally', () => {
  it('counts a closed thread apart from the ones that need you', () => {
    const tally = verdictTally({
      verdicts: [verdict({ kind: 'open', isClosed: true }), verdict({ kind: 'open' })],
    });

    expect(tally.open).toBe(1);
    expect(tally.closed).toBe(1);
    expect(tally.total).toBe(2);
  });

  it('keeps the verdict of a closed thread in its own bucket', () => {
    const tally = verdictTally({
      verdicts: [
        verdict({ kind: 'resolved', isClosed: true }),
        verdict({ kind: 'wontfix', isClosed: true }),
      ],
    });

    expect(tally.resolved).toBe(1);
    expect(tally.wontfix).toBe(1);
    expect(tally.settled).toBe(2);
    expect(tally.closed).toBe(0);
  });

  it('leaves an untouched agent counting exactly as its verdicts read', () => {
    const tally = verdictTally({
      verdicts: [verdict({ kind: 'resolved' }), verdict({ kind: 'open' })],
    });

    expect(tally.closed).toBe(0);
    expect(tally.settled).toBe(1);
    expect(tally.isMixed).toBe(true);
  });
});
