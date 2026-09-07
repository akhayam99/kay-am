import { describe, expect, it } from 'vitest';
import type { ResolveAttempt, ResolveThread, ResolveThreadState } from '@goodboy/types';
import { conversationPresentation } from './conversationPresentation';

const rowOf = (patch: Partial<ResolveThread>): ResolveThread =>
  ({
    threadId: 'PRRT_1',
    state: 'open' as ResolveThreadState,
    stateReason: null,
    revision: 1,
    activeAttemptId: null,
    disposition: null,
    replyDraft: null,
    commitShas: null,
    question: null,
    replyPostedAt: null,
    replyId: null,
    githubResolved: null,
    closedAt: null,
    closedSource: null,
    ...patch,
  }) as ResolveThread;

const attemptOf = (patch: Partial<ResolveAttempt>): ResolveAttempt =>
  ({
    id: 'attempt-1',
    agentId: 'agent-1',
    threadIds: ['PRRT_1'],
    phase: 'running',
    startedAt: 1000,
    endedAt: null,
    error: null,
    ...patch,
  }) as ResolveAttempt;

describe('conversationPresentation', () => {
  it('offers Fix on a thread GitHub knows about but Goodboy has never touched', () => {
    const shown = conversationPresentation({ row: null });

    expect(shown.badge).toBe('open');
    expect(shown.primary).toBe('fix');
    expect(shown.secondary).toEqual(['write_reply', 'fix_separately']);
    expect(shown.isSelectable).toBe(true);
    expect(shown.isFixable).toBe(true);
  });

  it('tells a waiting queued attempt apart from a running one, and only lets you cancel the queued', () => {
    const queued = conversationPresentation({
      row: rowOf({ state: 'working', activeAttemptId: 'attempt-1' }),
      attempt: attemptOf({ phase: 'queued', startedAt: null }),
    });
    const running = conversationPresentation({
      row: rowOf({ state: 'working', activeAttemptId: 'attempt-1' }),
      attempt: attemptOf({}),
    });

    expect(queued.supporting).toBe('Waiting for current work');
    expect(queued.secondary).toEqual(['cancel_run']);
    expect(queued.isRunning).toBe(false);
    expect(queued.isWaiting).toBe(true);
    expect(running.supporting).toBeNull();
    expect(running.secondary).toEqual(['stop_run']);
    expect(running.isRunning).toBe(true);
    expect(running.elapsedFrom).toBe(1000);
  });

  it('treats a lease waiting on this agent as waiting even when the attempt says running', () => {
    const shown = conversationPresentation({
      row: rowOf({ state: 'working' }),
      attempt: attemptOf({}),
      isLeaseWaiting: true,
    });

    expect(shown.supporting).toBe('Waiting for current work');
  });

  it('says a candidate fix is being checked while the run is still going', () => {
    const shown = conversationPresentation({
      row: rowOf({ state: 'working', stateReason: 'candidate:fixed' }),
      attempt: attemptOf({}),
    });

    expect(shown.supporting).toBe('Fix committed, checking');
  });

  it('surfaces the first line of an open question and offers Answer', () => {
    const shown = conversationPresentation({
      row: rowOf({
        state: 'needs_answer',
        stateReason: 'question',
        question: 'Which timeout applies?\nThe socket one or the request one?',
      }),
    });

    expect(shown.badge).toBe('needs_you');
    expect(shown.supporting).toBe('Which timeout applies?');
    expect(shown.primary).toBe('answer');
  });

  it('offers Fix on a proposed change and Retry on a legacy result', () => {
    const proposed = conversationPresentation({
      row: rowOf({ state: 'needs_answer', stateReason: 'proposed_fix' }),
    });
    const legacy = conversationPresentation({
      row: rowOf({ state: 'needs_answer', stateReason: 'review_legacy_result' }),
    });

    expect(proposed.supporting).toBe('Change proposed');
    expect(proposed.primary).toBe('fix');
    expect(proposed.isFixable).toBe(true);
    expect(legacy.supporting).toBe('Result needs a look');
    expect(legacy.primary).toBe('retry');
  });

  it('makes a committed fix publishable when its sha is on the branch', () => {
    const shown = conversationPresentation({
      row: rowOf({ state: 'fixed', disposition: 'fix', commitShas: ['a1b2c3d'] }),
      branchShas: new Set(['a1b2c3d']),
    });

    expect(shown.badge).toBe('ready');
    expect(shown.supporting).toBe('Fix committed');
    expect(shown.primary).toBe('publish');
    expect(shown.isPublishable).toBe(true);
    expect(shown.isSelectable).toBe(true);
  });

  it('sends a fix whose commit left the branch back to you with Recheck fix', () => {
    const shown = conversationPresentation({
      row: rowOf({ state: 'fixed', disposition: 'fix', commitShas: ['a1b2c3d'] }),
      branchShas: new Set(['other']),
    });

    expect(shown.badge).toBe('needs_you');
    expect(shown.supporting).toBe('Fix changed since review');
    expect(shown.primary).toBe('recheck_fix');
    expect(shown.isPublishable).toBe(false);
  });

  it('refuses to publish a fix while another writer holds the worktree', () => {
    const shown = conversationPresentation({
      row: rowOf({ state: 'fixed', disposition: 'fix', commitShas: ['a1b2c3d'] }),
      branchShas: new Set(['a1b2c3d']),
      isWriterBusy: true,
    });

    expect(shown.badge).toBe('ready');
    expect(shown.isPublishable).toBe(false);
  });

  it('separates a prepared reply from a no-change closure', () => {
    const noChange = conversationPresentation({
      row: rowOf({ state: 'answered', disposition: 'no_change', stateReason: 'wontfix:by design' }),
    });
    const reply = conversationPresentation({
      row: rowOf({ state: 'answered', disposition: 'reply' }),
    });

    expect(noChange.supporting).toBe('No change needed');
    expect(reply.supporting).toBe('Reply prepared');
    expect(noChange.isPublishable).toBe(true);
    expect(reply.isPublishable).toBe(true);
  });

  it('reads a failed publication back as Retry publish and never re-runs the agent', () => {
    const shown = conversationPresentation({
      row: rowOf({
        state: 'fixed',
        disposition: 'fix',
        stateReason: 'publication_failed:{"error":"remote rejected","reason":null}',
      }),
    });

    expect(shown.badge).toBe('needs_you');
    expect(shown.supporting).toBe('Publish failed: remote rejected');
    expect(shown.primary).toBe('retry_publish');
    expect(shown.isPublishable).toBe(false);
  });

  it.each([
    {
      stateReason: 'dirty_tree:',
      supporting: 'Uncommitted changes in the worktree',
      primary: 'review_changes',
    },
    { stateReason: 'stopped:', supporting: 'Stopped', primary: 'retry' },
    { stateReason: 'interrupted', supporting: 'Interrupted', primary: 'retry' },
    { stateReason: 'missing_result:', supporting: 'No result', primary: 'retry' },
  ])('explains a $supporting failure', ({ stateReason, supporting, primary }) => {
    const shown = conversationPresentation({ row: rowOf({ state: 'failed', stateReason }) });

    expect(shown.badge).toBe('needs_you');
    expect(shown.supporting).toBe(supporting);
    expect(shown.primary).toBe(primary);
  });

  it('parks a publishing row with a progress verb and no selection', () => {
    const shown = conversationPresentation({ row: rowOf({ state: 'publishing' }) });

    expect(shown.badge).toBe('working');
    expect(shown.supporting).toBe('Publishing');
    expect(shown.primary).toBe('view_progress');
    expect(shown.isSelectable).toBe(false);
  });

  it('names who closed a resolved conversation', () => {
    const byUs = conversationPresentation({
      row: rowOf({ state: 'closed', closedSource: 'goodboy' }),
    });
    const elsewhere = conversationPresentation({
      row: rowOf({ state: 'closed', closedSource: 'github' }),
    });

    expect(byUs.supporting).toBe('On GitHub');
    expect(elsewhere.supporting).toBe('Resolved elsewhere');
    expect(byUs.primary).toBe('view_on_github');
  });

  it('files a row whose thread left the pull request under Resolved', () => {
    const shown = conversationPresentation({ row: rowOf({ state: 'fixed' }), isOrphan: true });

    expect(shown.badge).toBe('resolved');
    expect(shown.supporting).toBe('Not on this pull request');
  });

  it('reads a GitHub thread already resolved with no row of our own as resolved elsewhere', () => {
    const shown = conversationPresentation({ row: null, isResolvedOnGithub: true });

    expect(shown.badge).toBe('resolved');
    expect(shown.supporting).toBe('Resolved elsewhere');
  });
});
