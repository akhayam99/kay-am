import { describe, expect, it } from 'vitest';
import type { FileDiff, PrCheckRun } from '@goodboy/types';
import {
  buildResolveQueueChecksByThreadId,
  resolveQueueChecksSummary,
} from './resolveQueueChecksSummary';

const checks: ReadonlyArray<PrCheckRun> = [
  { name: 'build', conclusion: 'success', detailsUrl: null, durationMs: null },
  { name: 'lint', conclusion: 'success', detailsUrl: null, durationMs: null },
  { name: 'test', conclusion: 'failure', detailsUrl: null, durationMs: null },
];

const fileDiff: FileDiff = {
  path: 'src/index.ts',
  status: 'modified',
  additions: 3,
  deletions: 1,
  binary: false,
  hunks: [],
};

describe('resolveQueueChecksSummary', () => {
  it('counts passing checks and reads the file diff stat', () => {
    expect(resolveQueueChecksSummary({ checks, fileDiff })).toEqual({
      totalCount: 3,
      passCount: 2,
      additions: 3,
      deletions: 1,
    });
  });

  it('reports a zero-size change when there is no file diff', () => {
    expect(resolveQueueChecksSummary({ checks, fileDiff: null })).toEqual({
      totalCount: 3,
      passCount: 2,
      additions: 0,
      deletions: 0,
    });
  });
});

describe('buildResolveQueueChecksByThreadId', () => {
  it('maps a thread to its checks summary only when the file diff is found', () => {
    const map = buildResolveQueueChecksByThreadId({
      threadPaths: new Map([
        ['t1', 'src/index.ts'],
        ['t2', 'src/missing.ts'],
        ['t3', null],
      ]),
      checks,
      files: [fileDiff],
    });
    expect(map.get('t1')).toEqual({ totalCount: 3, passCount: 2, additions: 3, deletions: 1 });
    expect(map.get('t2')).toBeNull();
    expect(map.get('t3')).toBeNull();
  });
});
