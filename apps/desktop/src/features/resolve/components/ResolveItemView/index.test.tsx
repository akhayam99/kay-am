// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  integratedSha = null,
}: {
  readonly threadId: string;
  readonly note: ResolveQueueReviewerNote;
  readonly coveredThreadIds?: ReadonlyArray<string>;
  readonly proposal?: string | null;
  readonly integratedSha?: string | null;
}): ResolveQueueRow =>
  ({
    item: { id: `item-${threadId}`, integratedSha },
    thread: { threadId, revision: 1, stateReason: null, commitShas: null, question: null },
    status: 'for_you',
    attempt: null,
    reviewerNote: note,
    proposal,
    coveredThreadIds,
    delivery: null,
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
      candidateSha={null}
      reply="Added the early return."
      instruction=""
      mode="reply"
      proposalKind="fix"
      isBusy={false}
      canApprove
      approveBlockedReason={null}
      refuseBlockedReason={null}
      checksNote={null}
      canRunCheck={false}
      isCheckRunning={false}
      error={null}
      onChangeReply={vi.fn()}
      onChangeInstruction={vi.fn()}
      onApprove={vi.fn()}
      onStartRevise={vi.fn()}
      onCancelRevise={vi.fn()}
      onStartRefuse={vi.fn()}
      onCancelRefuse={vi.fn()}
      onRefuse={vi.fn()}
      onSendToAgent={vi.fn()}
      onLater={vi.fn()}
      onReopen={vi.fn()}
      onOpenInDiff={vi.fn()}
      onOpenCommit={vi.fn()}
      onRunCheck={vi.fn()}
      onStopRun={vi.fn()}
      onViewWork={vi.fn()}
      onSelectRelated={vi.fn()}
      {...overrides}
    />,
  );

afterEach(cleanup);

describe('the resolve item view', () => {
  it('leads with the full reviewer request and its location', () => {
    renderView();

    expect(screen.getByText('This retries forever on a 500.')).toBeDefined();
    expect(screen.getByText('src/retry.ts:84')).toBeDefined();
  });

  it('lists the other comments of the shared run without repeating the agent draft', () => {
    renderView();

    expect(screen.getByText('Related comments')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'The parser swallows the error here.' }),
    ).toBeDefined();
    expect(screen.getByText('Shared run · 2 comments')).toBeDefined();
  });

  it('selects a sibling comment in place instead of approving it', () => {
    const onSelectRelated = vi.fn();
    renderView({ onSelectRelated });

    fireEvent.click(screen.getByRole('button', { name: 'The parser swallows the error here.' }));

    expect(onSelectRelated).toHaveBeenCalledWith('t-parser');
  });

  it('approves this comment alone from the fixed header action', () => {
    const onApprove = vi.fn();
    renderView({ onApprove });

    fireEvent.click(screen.getByRole('button', { name: 'Approve fix' }));

    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('states the gate on a blocked approval instead of an unexplained disabled button', () => {
    renderView({ canApprove: false, approveBlockedReason: 'Answer the agent question first' });

    const approve = screen.getByRole('button', { name: 'Approve fix' });
    expect(approve.hasAttribute('disabled')).toBe(true);
  });

  it('shows the exact reply that goes back to the reviewer', () => {
    renderView();

    expect(screen.getByLabelText('Reply to reviewer')).toHaveProperty(
      'value',
      'Added the early return.',
    );
  });

  it('names the missing fix in the same shape as a present one, beside its label', () => {
    renderView();

    expect(screen.getByText('Fixing commit')).toBeDefined();
    expect(screen.getByText('Not recorded')).toBeDefined();
  });

  it('opens the exact recorded commit from the fixing-commit line', () => {
    const onOpenCommit = vi.fn();
    renderView({
      row: { ...LEAD, item: { ...LEAD.item, integratedSha: 'a1b2c3d4e5f6a7b8' } } as typeof LEAD,
      onOpenCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: 'a1b2c3d' }));

    expect(onOpenCommit).toHaveBeenCalledWith({ sha: 'a1b2c3d4e5f6a7b8' });
  });

  it('summarises the change and offers one way into the whole diff', () => {
    const onOpenInDiff = vi.fn();
    renderView({
      files: [
        fileDiffOf({ path: 'src/retry.ts', added: ['  if (attempts > 3) return;'] }),
        fileDiffOf({
          path: 'src/parser.test.ts',
          added: ['  expect(parse("x")).toThrow();', '  expect(calls).toBe(1);'],
        }),
      ],
      onOpenInDiff,
    });

    expect(screen.getByText('2 files · 3 changed lines')).toBeDefined();
    expect(screen.queryByText(/if \(attempts > 3\) return;/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open diff' }));
    expect(onOpenInDiff).toHaveBeenCalledOnce();
  });

  it('says no captured change rather than claiming a fix', () => {
    renderView();

    expect(screen.getByText('No captured change')).toBeDefined();
  });

  it('says why the run ended badly instead of leaving the reply alone on screen', () => {
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

  it('says no checks ran rather than implying a check passed', () => {
    renderView();

    expect(screen.getByText('No checks run')).toBeDefined();
    expect(screen.queryByRole('button', { name: /No checks run ·/ })).toBeNull();
    expect(screen.queryByText('Passed')).toBeNull();
  });

  it('says Passed on a fresh receipt only after the receipts are disclosed', () => {
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

    expect(screen.getByText('Scoped checks')).toBeDefined();
    expect(screen.queryByText('Passed')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: /Passes on proposal; current code not checked · 1 run/ }),
    );

    expect(screen.getByText('Passed')).toBeDefined();
    expect(screen.getByText('pnpm test')).toBeDefined();
  });

  it('marks a run whose tree moved as stale instead of green', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Checks out of date · 1 run/ }));
    expect(screen.getByText('Stale')).toBeDefined();
    expect(screen.queryByText('Passed')).toBeNull();
  });

  it('commits a revision request through its own footer, never through the reply', () => {
    const onSendToAgent = vi.fn();
    renderView({ mode: 'revise', instruction: 'Cap the attempts at three.', onSendToAgent });

    expect(screen.queryByRole('button', { name: 'Approve fix' })).toBeNull();
    expect(screen.getByLabelText('Instructions for agent')).toHaveProperty(
      'value',
      'Cap the attempts at three.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send to agent' }));
    expect(onSendToAgent).toHaveBeenCalledOnce();
  });

  it('refuses to send an empty instruction to the agent', () => {
    renderView({ mode: 'revise', instruction: '   ' });

    expect(screen.getByRole('button', { name: 'Send to agent' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it('offers the refusal from the overflow menu and edits the reviewer reply in place', () => {
    const onStartRefuse = vi.fn();
    renderView({ onStartRefuse });

    fireEvent.click(screen.getByRole('button', { name: 'Comment actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Will not fix' }));

    expect(onStartRefuse).toHaveBeenCalledOnce();
  });

  it('blocks the refusal with its reason once the fix is already integrated', () => {
    renderView({ refuseBlockedReason: 'Fix already integrated' });

    fireEvent.click(screen.getByRole('button', { name: 'Comment actions' }));

    const entry = screen.getByRole('menuitem', { name: /Will not fix/ });
    expect(entry.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Fix already integrated')).toBeDefined();
  });

  it('refuses to post a blank refusal and says why', () => {
    renderView({ mode: 'refuse', reply: '   ' });

    expect(screen.getByRole('button', { name: 'Will not fix' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      screen.getByText('Write the reply the reviewer will read before you refuse'),
    ).toBeDefined();
  });

  it('confirms the refusal from its own footer once the reply is written', () => {
    const onRefuse = vi.fn();
    renderView({ mode: 'refuse', reply: 'We are keeping this as it is.', onRefuse });

    expect(screen.queryByRole('button', { name: 'Approve fix' })).toBeNull();
    expect(screen.getByLabelText('Reply to reviewer')).toHaveProperty(
      'value',
      'We are keeping this as it is.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Will not fix' }));

    expect(onRefuse).toHaveBeenCalledOnce();
  });

  it('says what is missing instead of offering the approval of nothing', () => {
    renderView({
      proposalKind: 'none',
      canApprove: false,
      approveBlockedReason: 'No fix and no reply to approve yet',
    });

    expect(screen.getByText('No agent reply yet')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Approve fix' }).hasAttribute('disabled')).toBe(true);
  });

  it('marks a deliberate reply without a code change as exactly that', () => {
    renderView({ proposalKind: 'reply_only' });

    expect(screen.getByText('Reply only, no code change')).toBeDefined();
    expect(screen.queryByText('No agent reply yet')).toBeNull();
  });

  it('leads with the answer while the agent is waiting on one', () => {
    const onStartRevise = vi.fn();
    renderView({ row: { ...LEAD, status: 'agent_asked' } as typeof LEAD, onStartRevise });

    expect(screen.queryByRole('button', { name: 'Approve fix' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Answer agent' }));

    expect(onStartRevise).toHaveBeenCalledOnce();
  });

  it('names the agent answer field for what it answers', () => {
    renderView({
      row: { ...LEAD, status: 'agent_asked' } as typeof LEAD,
      mode: 'revise',
      instruction: 'Cap the attempts at three.',
    });

    expect(screen.getByLabelText('Answer for agent')).toHaveProperty(
      'value',
      'Cap the attempts at three.',
    );
  });

  it('says a refused comment was answered and its reviewer thread left open', () => {
    renderView({
      row: {
        ...LEAD,
        status: 'wont_fix_sent',
        delivery: {
          isReplyPosted: true,
          replyPostedAt: 10,
          isThreadResolved: false,
          resolvedAt: null,
          isComplete: true,
          replyBody: 'We are keeping this as it is.',
        },
      } as unknown as ResolveQueueRow,
    });

    expect(screen.getByText('Reply posted')).toBeDefined();
    expect(screen.getByText('Reply posted · Thread left open')).toBeDefined();
    expect(screen.queryByLabelText('Reply to reviewer')).toBeNull();
  });
});
