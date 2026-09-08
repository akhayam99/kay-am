import { describe, expect, it } from 'vitest';
import type { FileDiff } from '@goodboy/types';
import { INLINE_CHANGE_LINE_LIMIT, inlineChangePlan } from './inlineChangePlan';

const fileDiff = ({
  path,
  additions,
  deletions = 0,
  binary = false,
}: {
  readonly path: string;
  readonly additions: number;
  readonly deletions?: number;
  readonly binary?: boolean;
}): FileDiff => ({
  path,
  status: 'modified',
  additions,
  deletions,
  binary,
  hunks: [
    {
      header: `@@ -1,${deletions + 1} +1,${additions + 1} @@`,
      oldStart: 1,
      oldLines: deletions + 1,
      newStart: 1,
      newLines: additions + 1,
      lines: [{ kind: 'context', oldLine: 1, newLine: 1, text: ' unchanged' }],
    },
  ],
});

describe('inline change plan', () => {
  it('shows every file whole when the whole change is small, across several files', () => {
    const files = [
      fileDiff({ path: 'src/retry.ts', additions: 6, deletions: 2 }),
      fileDiff({ path: 'src/parser.ts', additions: 3, deletions: 1 }),
      fileDiff({ path: 'src/parser.test.ts', additions: 9 }),
    ];

    const plan = inlineChangePlan({ files });

    expect(plan.kind).toBe('whole');
    expect(plan.files.map((file) => file.path)).toEqual([
      'src/retry.ts',
      'src/parser.ts',
      'src/parser.test.ts',
    ]);
    expect(plan.changedLines).toBe(21);
  });

  it('never truncates a change that sits exactly on the threshold', () => {
    const plan = inlineChangePlan({
      files: [fileDiff({ path: 'src/retry.ts', additions: INLINE_CHANGE_LINE_LIMIT })],
    });

    expect(plan.kind).toBe('whole');
  });

  it('keeps the added test readable when the whole change is too large to show', () => {
    const files = [
      fileDiff({ path: 'src/retry.ts', additions: 60, deletions: 20 }),
      fileDiff({ path: 'src/__tests__/retry.test.ts', additions: 9 }),
    ];

    const plan = inlineChangePlan({ files });

    expect(plan.kind).toBe('tests_only');
    expect(plan.files.map((file) => file.path)).toEqual(['src/__tests__/retry.test.ts']);
    expect(plan.hiddenFileCount).toBe(1);
  });

  it('hands a large change with no test over to the diff', () => {
    const plan = inlineChangePlan({
      files: [fileDiff({ path: 'src/retry.ts', additions: 80, deletions: 40 })],
    });

    expect(plan).toEqual({ kind: 'too_large', files: [], changedLines: 120, hiddenFileCount: 1 });
  });

  it('refuses to call a change whole when part of it is binary', () => {
    const plan = inlineChangePlan({
      files: [
        fileDiff({ path: 'src/retry.ts', additions: 2 }),
        { ...fileDiff({ path: 'assets/logo.png', additions: 0 }), binary: true, hunks: [] },
      ],
    });

    expect(plan.kind).toBe('too_large');
  });
});
