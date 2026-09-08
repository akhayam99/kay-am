import { describe, expect, it } from 'vitest';
import { tallySentence } from './tallySentence';
import { verdictTally } from './verdictTally';
import type { ResolverThreadVerdictKind } from './resolverThreadVerdicts';

const verdict = ({
  kind,
  isClosed = false,
}: {
  readonly kind: ResolverThreadVerdictKind;
  readonly isClosed?: boolean;
}) => ({ kind, isClosed });

describe('tallySentence', () => {
  it('calls a closed thread closed instead of saying it needs you', () => {
    const sentence = tallySentence({
      tally: verdictTally({
        verdicts: [verdict({ kind: 'resolved' }), verdict({ kind: 'open', isClosed: true })],
      }),
    });

    expect(sentence).toBe('1 fixed · 1 closed');
  });

  it('still ends on what the operator has left to do', () => {
    const sentence = tallySentence({
      tally: verdictTally({
        verdicts: [verdict({ kind: 'open', isClosed: true }), verdict({ kind: 'open' })],
      }),
    });

    expect(sentence).toBe('1 closed · 1 needs you');
  });

  it('reads the same as before on an agent nothing closed', () => {
    const sentence = tallySentence({
      tally: verdictTally({
        verdicts: [
          verdict({ kind: 'resolved' }),
          verdict({ kind: 'wontfix' }),
          verdict({ kind: 'open' }),
        ],
      }),
    });

    expect(sentence).toBe('1 fixed · 1 no change · 1 needs you');
  });
});
