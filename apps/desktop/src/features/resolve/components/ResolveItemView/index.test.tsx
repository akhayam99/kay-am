// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FileDiff } from '@goodboy/types';
import type { ResolveChecksSummary } from '../../checkReceipts';
import type { ResolveQueueRow, ResolveQueueReviewerNote } from '../../buildResolveQueueRows';
import { ResolveItemView } from './index';

const noteOf = ({
  body,
  path,
  line,
}: {
  readonly body: string;
  readonly path: string;
  readonly line: number;
}): ResolveQueueReviewerNote => ({
  body,
  author: 'dhh',
  createdAtMs: 1,
  location: `${path}:${line}`,
  path,
  line,
});

const rowOf = ({
  threadId,
  note,
  coveredThreadIds = [],
  proposal = 'Added the early return.',
}: {
  readonly threadId: string;
  readonly note: ResolveQueueReviewerNote;
  readonly coveredThreadIds?: ReadonlyArray<string>;
  readonly proposal?: string | null;
}): ResolveQueueRow =>
  ({
    item: { id: `item-${threadId}` },
    thread: { threadId, revision: 1, stateReason: null },
    status: 'for_you',
    attempt: null,
    reviewerNote: note,
    proposal,
    coveredThreadIds,
  }) as unknown as ResolveQueueRow;

const fileDiffOf = ({
  path,
  added,
}: {
  readonly path: string;
  readonly added: ReadonlyArray<string>;
}): FileDiff => ({
  path,
  status: 'modified',
  additions: added.length,
  deletions: 0,
  binary: false,
  hunks: [
    {
      header: `@@ -30,1 +30,${added.length + 1} @@`,
      oldStart: 30,
      oldLines: 1,
      newStart: 30,
      newLines: added.length + 1,
      lines: [
        { kind: 'context', oldLine: 30, newLine: 30, text: 'const retry = () => {' },
        ...added.map((text, index) => ({
          kind: 'add' as const,
          oldLine: null,
          newLine: 31 + index,
          text,
        })),
      ],
    },
  ],
});

const NOTHING_RAN: ResolveChecksSummary = {
  receipts: [],
  verdict: { kind: 'nothing_ran' },
  isScoped: false,
};

const LEAD = rowOf({
  threadId: 't-retry',
  note: noteOf({ body: 'This retries forever on a 500.', path: 'src/retry.ts', line: 84 }),
  coveredThreadIds: ['t-parser'],
});

const COVERED = rowOf({
  threadId: 't-parser',
  note: noteOf({ body: 'The parser swallows the error here.', path: 'src/parser.ts', line: 31 }),
});

const renderView = (overrides: Partial<Parameters<typeof ResolveItemView>[0]> = {}) =>
  render(
    <ResolveItemView
      row={LEAD}
      coveredRows={[COVERED]}
      files={[]}
      isDiffLoading={false}
      diffError={null}
      checks={NOTHING_RAN}
      costUsd={null}
      reply="Added the early return."
      instruction=""
      isBusy={false}
      canAccept
      canRunCheck={false}
      isCheckRunning={false}
      error={null}
      hasPrevious={false}
      hasNext={false}
      onChangeReply={vi.fn()}
      onChangeInstruction={vi.fn()}
      onAccept={vi.fn()}
      onAskForChanges={vi.fn()}
      onLater={vi.fn()}
      onOpenInDiff={vi.fn()}
      onRunCheck={vi.fn()}
      onStopRun={vi.fn()}
      onViewWork={vi.fn()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      onCollapse={vi.fn()}
      {...overrides}
    />,
  );

afterEach(cleanup);

describe('the resolve item view', () => {
  it('shows every comment the proposal covers, not only the one the user clicked', () => {
    renderView();

    expect(screen.getByText('This retries forever on a 500.')).toBeDefined();
    expect(screen.getByText('The parser swallows the error here.')).toBeDefined();
    expect(screen.getByText('src/parser.ts:31')).toBeDefined();
  });

  it('counts the covered comments on the accept verb', () => {
    renderView();

    expect(screen.getByRole('button', { name: 'Accept fix (2)' })).toBeDefined();
  });

  it('renders every hunk of a small change, across every file it touches', () => {
    renderView({
      files: [
        fileDiffOf({ path: 'src/retry.ts', added: ['  if (attempts > 3) return;'] }),
        fileDiffOf({
          path: 'src/parser.test.ts',
          added: ['  expect(parse("x")).toThrow();', '  expect(calls).toBe(1);'],
        }),
      ],
    });

    expect(screen.getByText(/if \(attempts > 3\) return;/)).toBeDefined();
    expect(screen.getByText(/expect\(parse\("x"\)\)\.toThrow\(\);/)).toBeDefined();
    expect(screen.getByText(/expect\(calls\)\.toBe\(1\);/)).toBeDefined();
    expect(screen.getByText('Lines 30-31')).toBeDefined();
    expect(screen.getByText('Lines 30-32')).toBeDefined();
    expect(screen.getByText('2 files · 3 changed lines')).toBeDefined();
  });

  it('keeps the added test readable when the rest of the change is too large to show', () => {
    const large = fileDiffOf({ path: 'src/retry.ts', added: ['  noop();'] });
    renderView({
      files: [
        { ...large, additions: 90, deletions: 10 },
        fileDiffOf({ path: 'src/retry.test.ts', added: ['  expect(calls).toBe(2);'] }),
      ],
    });

    expect(screen.getByText(/expect\(calls\)\.toBe\(2\);/)).toBeDefined();
    expect(screen.queryByText(/noop\(\);/)).toBeNull();
    expect(screen.getByText('1 more file is only in the diff')).toBeDefined();
  });

  it('says why the run ended badly instead of leaving the proposal alone on screen', () => {
    renderView({
      row: {
        ...LEAD,
        thread: { ...LEAD.thread, stateReason: 'dirty_tree:candidate:' },
      } as typeof LEAD,
    });

    expect(
      screen.getByText('The worktree still held uncommitted changes when this run ended.'),
    ).toBeDefined();
  });

  it('says nothing ran rather than implying a check passed', () => {
    renderView();

    expect(screen.getByText('Nothing ran against this proposal')).toBeDefined();
    expect(screen.queryByText('Machine verified')).toBeNull();
  });

  it('separates the agent claim from the machine receipt', () => {
    renderView({
      checks: {
        receipts: [
          {
            run: {
              id: 'run-1',
              sessionId: 'session-1',
              candidateId: 'candidate-1',
              command: 'pnpm test',
              testIdentity: 'stops after three attempts',
              breadth: 'scoped',
              baseTree: 'base',
              candidateTree: 'cand',
              acceptedSet: [],
              outcome: 'passed',
              exitCode: 0,
              durationMs: 4000,
              logRef: 'run-1',
              createdAt: 2,
            },
            tree: 'candidate',
            isStale: false,
          },
        ],
        verdict: { kind: 'passes_without_base_run', testIdentity: 'stops after three attempts' },
        isScoped: true,
      } as unknown as ResolveChecksSummary,
    });

    expect(
      screen.getByText('Passes on the proposal. It never ran on the current code'),
    ).toBeDefined();
    expect(screen.getByText('A scoped run, not the full suite.')).toBeDefined();
    expect(screen.getByText('Machine verified')).toBeDefined();
    expect(screen.getByText('Agent claim, not checked here')).toBeDefined();
  });

  it('marks a receipt whose tree moved as stale instead of green', () => {
    renderView({
      checks: {
        receipts: [
          {
            run: {
              id: 'run-1',
              sessionId: 'session-1',
              candidateId: 'candidate-1',
              command: 'pnpm test',
              testIdentity: null,
              breadth: 'full',
              baseTree: 'old-base',
              candidateTree: 'old-cand',
              acceptedSet: [],
              outcome: 'passed',
              exitCode: 0,
              durationMs: 4000,
              logRef: 'run-1',
              createdAt: 2,
            },
            tree: 'candidate',
            isStale: true,
          },
        ],
        verdict: { kind: 'all_stale' },
        isScoped: false,
      } as unknown as ResolveChecksSummary,
    });

    expect(screen.getByText('Stale')).toBeDefined();
    expect(screen.queryByText('Machine verified')).toBeNull();
    expect(screen.getByText('Every receipt is stale, so nothing here is proven')).toBeDefined();
  });

  it('shows the exact reply that goes back to the reviewer', () => {
    renderView();

    expect(screen.getByLabelText('This exact text goes back to the reviewer')).toHaveProperty(
      'value',
      'Added the early return.',
    );
  });
});
