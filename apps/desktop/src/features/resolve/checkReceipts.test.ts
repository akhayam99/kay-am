import { describe, expect, it } from 'vitest';
import type { ResolveCandidate, ResolveCheckRun, SessionId } from '@goodboy/types';
import { summariseResolveChecks } from './checkReceipts';

const sessionId = 'session' as SessionId;

const candidate: ResolveCandidate = {
  id: 'candidate',
  sessionId,
  revision: 1,
  baseSha: 'base-sha',
  candidateSha: 'candidate-sha',
  worktreePath: '/tmp/worktree',
  state: 'ready',
  integratedSha: null,
  createdAt: 1,
  updatedAt: 1,
};

const run = (patch: Partial<ResolveCheckRun>): ResolveCheckRun => ({
  id: 'run',
  sessionId,
  candidateId: 'candidate',
  command: 'pnpm test',
  testIdentity: 'retries once on a 429',
  breadth: 'full',
  baseTree: 'base-sha',
  candidateTree: null,
  acceptedSet: [],
  outcome: 'passed',
  exitCode: 0,
  durationMs: 1000,
  logRef: 'log',
  createdAt: 10,
  ...patch,
});

describe('resolve check receipts', () => {
  it('says nothing ran when there is no receipt', () => {
    expect(summariseResolveChecks({ runs: [], candidate, acceptedSet: [] }).verdict).toEqual({
      kind: 'nothing_ran',
    });
  });

  it('claims the fix is proven only with a failing base run and a passing candidate run', () => {
    const summary = summariseResolveChecks({
      runs: [
        run({ id: 'base', outcome: 'failed', exitCode: 1, createdAt: 10 }),
        run({ id: 'candidate', candidateTree: 'candidate-sha', createdAt: 20 }),
      ],
      candidate,
      acceptedSet: [],
    });

    expect(summary.verdict).toEqual({
      kind: 'proves_the_fix',
      testIdentity: 'retries once on a 429',
    });
  });

  it('says the base run is missing rather than implying the fix is proven', () => {
    const summary = summariseResolveChecks({
      runs: [run({ id: 'candidate', candidateTree: 'candidate-sha' })],
      candidate,
      acceptedSet: [],
    });

    expect(summary.verdict).toEqual({
      kind: 'passes_without_base_run',
      testIdentity: 'retries once on a 429',
    });
  });

  it('refuses to read a green candidate run as proof when the base run passed too', () => {
    const summary = summariseResolveChecks({
      runs: [
        run({ id: 'base', createdAt: 10 }),
        run({ id: 'candidate', candidateTree: 'candidate-sha', createdAt: 20 }),
      ],
      candidate,
      acceptedSet: [],
    });

    expect(summary.verdict.kind).toBe('passes_on_both');
  });

  it('marks a receipt stale when the tree it ran against moved', () => {
    const summary = summariseResolveChecks({
      runs: [run({ candidateTree: 'candidate-sha' })],
      candidate: { ...candidate, candidateSha: 'rebuilt-sha' },
      acceptedSet: [],
    });

    expect(summary.receipts.map((receipt) => receipt.isStale)).toEqual([true]);
    expect(summary.verdict).toEqual({ kind: 'all_stale' });
  });

  it('marks a receipt stale when the accepted set it was combined with changed', () => {
    const summary = summariseResolveChecks({
      runs: [run({ candidateTree: 'candidate-sha', acceptedSet: ['item-1'] })],
      candidate,
      acceptedSet: ['item-1', 'item-2'],
    });

    expect(summary.receipts[0]?.isStale).toBe(true);
  });

  it('keeps a receipt fresh when the accepted set only changed order', () => {
    const summary = summariseResolveChecks({
      runs: [run({ candidateTree: 'candidate-sha', acceptedSet: ['item-2', 'item-1'] })],
      candidate,
      acceptedSet: ['item-1', 'item-2'],
    });

    expect(summary.receipts[0]?.isStale).toBe(false);
  });

  it('reports a failing candidate run as a failure, never as silence', () => {
    const summary = summariseResolveChecks({
      runs: [run({ candidateTree: 'candidate-sha', outcome: 'failed', exitCode: 1 })],
      candidate,
      acceptedSet: [],
    });

    expect(summary.verdict).toEqual({ kind: 'fails_on_the_proposal' });
  });

  it('flags a scoped run so the block never reads as a full suite', () => {
    const summary = summariseResolveChecks({
      runs: [run({ candidateTree: 'candidate-sha', breadth: 'scoped' })],
      candidate,
      acceptedSet: [],
    });

    expect(summary.isScoped).toBe(true);
  });
});
