import type { FileDiff } from '@goodboy/types';

export const INLINE_CHANGE_LINE_LIMIT = 40;

const TEST_PATH =
  /(^|\/)__tests__\/|(^|\/)tests?\/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|_test\.[a-z]+$|(^|\/)test_[^/]+\.py$/;

export type InlineChangePlan =
  | {
      readonly kind: 'whole';
      readonly files: ReadonlyArray<FileDiff>;
      readonly changedLines: number;
      readonly hiddenFileCount: 0;
    }
  | {
      readonly kind: 'tests_only';
      readonly files: ReadonlyArray<FileDiff>;
      readonly changedLines: number;
      readonly hiddenFileCount: number;
    }
  | {
      readonly kind: 'too_large';
      readonly files: readonly [];
      readonly changedLines: number;
      readonly hiddenFileCount: number;
    };

type Params = { readonly files: ReadonlyArray<FileDiff> };

export const isTestPath = ({ path }: { readonly path: string }): boolean => TEST_PATH.test(path);

export const changedLineCount = ({ files }: Params): number =>
  files.reduce((total, file) => total + file.additions + file.deletions, 0);

export const inlineChangePlan = ({ files }: Params): InlineChangePlan => {
  const changedLines = changedLineCount({ files });
  const hasBinary = files.some((file) => file.binary);
  if (!hasBinary && changedLines <= INLINE_CHANGE_LINE_LIMIT) {
    return { kind: 'whole', files, changedLines, hiddenFileCount: 0 };
  }
  const tests = files.filter((file) => !file.binary && isTestPath({ path: file.path }));
  if (tests.length > 0) {
    return {
      kind: 'tests_only',
      files: tests,
      changedLines,
      hiddenFileCount: files.length - tests.length,
    };
  }
  return { kind: 'too_large', files: [], changedLines, hiddenFileCount: files.length };
};
