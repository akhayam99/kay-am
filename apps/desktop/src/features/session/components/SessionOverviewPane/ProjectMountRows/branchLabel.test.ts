import { describe, expect, it } from 'vitest';
import { splitBranchLabel } from './branchLabel';

describe('splitBranchLabel', () => {
  it('keeps the distinguishing tail of sibling branches out of the truncated head', () => {
    const header = splitBranchLabel({ branch: 'ak/admin-patient-header' });
    const paths = splitBranchLabel({ branch: 'ak/admin-patient-paths' });

    expect(header).toEqual({ head: 'ak/admin-patient', tail: '-header' });
    expect(paths).toEqual({ head: 'ak/admin-patient', tail: '-paths' });
    expect(header.tail).not.toBe(paths.tail);
  });

  it('cuts on the last separator of any kind', () => {
    expect(splitBranchLabel({ branch: 'release/2026.09' })).toEqual({
      head: 'release/2026',
      tail: '.09',
    });
    expect(splitBranchLabel({ branch: 'wip/ak/rounding' })).toEqual({
      head: 'wip/ak',
      tail: '/rounding',
    });
  });

  it('leaves a branch with no separator whole', () => {
    expect(splitBranchLabel({ branch: 'main' })).toEqual({ head: 'main', tail: '' });
  });

  it('refuses a tail long enough to squeeze the head out of the row', () => {
    expect(splitBranchLabel({ branch: 'fix/reconciliation-statement-backfill-batching' })).toEqual({
      head: 'fix/reconciliation-statement-backfill',
      tail: '-batching',
    });
    expect(splitBranchLabel({ branch: 'fix/ledger-reconciliationrewrite' })).toEqual({
      head: 'fix/ledger-reconciliationrewrite',
      tail: '',
    });
  });

  it('never cuts a leading separator away from the head', () => {
    expect(splitBranchLabel({ branch: '/odd' })).toEqual({ head: '/odd', tail: '' });
    expect(splitBranchLabel({ branch: '' })).toEqual({ head: '', tail: '' });
  });
});
