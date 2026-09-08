import { describe, expect, it } from 'vitest';
import type { PullRequestState, Session, SessionId, WorkspaceId } from '@goodboy/types';
import { deriveSessionStage } from './deriveSessionStage';

const DATE = '2026-08-04T00:00:00.000Z';

const session: Session = {
  id: 'session-1' as SessionId,
  workspaceId: 'workspace-1' as WorkspaceId,
  goal: 'Refactor authentication',
  state: { kind: 'idle', lastActivityAt: DATE as Session['createdAt'] },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
  permissionMode: 'bypassPermissions',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: DATE as Session['createdAt'],
  updatedAt: DATE as Session['updatedAt'],
};

const signals = { hasUnread: false, openQuestionCount: 0 };

const mergedPr: PullRequestState = {
  number: 42,
  title: 'Refactor authentication',
  url: 'https://github.com/acme/goodboy/pull/42',
  state: 'merged',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/refactor-auth',
  isDraft: false,
  reviewDecision: null,
  body: '',
  updatedAt: DATE,
};

describe('deriveSessionStage pull request freshness', () => {
  it('does not claim a session has no PR before GitHub has been checked', () => {
    const info = deriveSessionStage({ session, pr: null, ...signals, prFetchState: 'unknown' });
    expect(info.stage).toBe('building');
    expect(info.reason).not.toBe('no PR yet');
    expect(info.reason).toBe('checking GitHub');
  });

  it('claims no PR only once the fetch has landed', () => {
    const info = deriveSessionStage({ session, pr: null, ...signals, prFetchState: 'known' });
    expect(info).toEqual({ stage: 'building', reason: 'no PR yet', attention: null });
  });

  it('keeps the open-question attention reason', () => {
    const info = deriveSessionStage({
      session,
      pr: null,
      hasUnread: false,
      openQuestionCount: 1,
    });
    expect(info).toEqual({
      stage: 'attention',
      reason: '1 open question',
      attention: 'open-question',
    });
  });

  it('says GitHub is unreachable rather than claiming no PR when the fetch failed', () => {
    const info = deriveSessionStage({ session, pr: null, ...signals, prFetchState: 'unreachable' });
    expect(info.stage).toBe('building');
    expect(info.reason).toBe('GitHub unreachable');
  });

  it('keeps the three pr-less states apart', () => {
    const reasons = (['unknown', 'known', 'unreachable'] as const).map(
      (prFetchState) => deriveSessionStage({ session, pr: null, ...signals, prFetchState }).reason,
    );
    expect(new Set(reasons).size).toBe(3);
  });

  it('places a session from real PR data even while a later fetch is failing', () => {
    const info = deriveSessionStage({
      session,
      pr: mergedPr,
      ...signals,
      prFetchState: 'unreachable',
    });
    expect(info.stage).toBe('done');
    expect(info.reason).toBe('PR #42 merged');
  });

  it('lets a running agent outrank an unchecked pull request', () => {
    const running: Session = {
      ...session,
      state: {
        kind: 'running',
        runId: 'run-1' as never,
        startedAt: DATE as Session['createdAt'],
      },
    };
    const info = deriveSessionStage({
      session: running,
      pr: null,
      ...signals,
      prFetchState: 'unknown',
    });
    expect(info.stage).toBe('running');
  });

  it('keeps an external PR review in review even before GitHub answers', () => {
    const info = deriveSessionStage({
      session,
      pr: null,
      ...signals,
      isPrReview: true,
      prFetchState: 'unknown',
    });
    expect(info.stage).toBe('review');
  });
});

describe('deriveSessionStage orchestrator decision', () => {
  it('keeps a session awake while its orchestrator chooses the next step', () => {
    const info = deriveSessionStage({
      session,
      pr: null,
      ...signals,
      hasRunningAgent: false,
      isDecidingWorkflow: true,
    });

    expect(info).toEqual({ stage: 'running', reason: 'deciding the next step', attention: null });
  });

  it('keeps a branchless session awake for the same decision', () => {
    const info = deriveSessionStage({
      session,
      pr: null,
      ...signals,
      isBranchless: true,
      isDecidingWorkflow: true,
    });

    expect(info).toEqual({ stage: 'running', reason: 'deciding the next step', attention: null });
  });

  it('reads the same session as idle work once the decision has landed', () => {
    const info = deriveSessionStage({ session, pr: null, ...signals, isDecidingWorkflow: false });

    expect(info.stage).toBe('building');
  });
});

describe('deriveSessionStage lazy session', () => {
  it('places a freshly created branchless draft session as building and ready for work', () => {
    const draftSession: Session = { ...session, state: { kind: 'draft' } };

    const info = deriveSessionStage({
      session: draftSession,
      pr: null,
      ...signals,
      isBranchless: true,
    });

    expect(info.stage).toBe('building');
    expect(info.reason).toBe('ready for work');
  });
});

describe('deriveSessionStage sibling branch mounts', () => {
  it('marks a session done when the merged request is the only work left', () => {
    const info = deriveSessionStage({ session, pr: mergedPr, ...signals, remainingWork: 0 });

    expect(info.stage).toBe('done');
    expect(info.reason).toBe('PR #42 merged');
  });

  it('keeps a session in review while a sibling mount still has an open request', () => {
    const info = deriveSessionStage({
      session,
      pr: mergedPr,
      ...signals,
      remainingWork: 1,
      remainingReason: '1 other request still open',
    });

    expect(info.stage).toBe('review');
    expect(info.reason).toBe('PR #42 merged, 1 other request still open');
  });

  it('keeps a session in review while a sibling mount has work without a request', () => {
    const info = deriveSessionStage({
      session,
      pr: mergedPr,
      ...signals,
      remainingWork: 2,
      remainingReason: '2 branch mounts without a request',
    });

    expect(info.stage).toBe('review');
    expect(info.reason).toBe('PR #42 merged, 2 branch mounts without a request');
  });

  it('still lets a running agent win over the remaining sibling work', () => {
    const info = deriveSessionStage({
      session,
      pr: mergedPr,
      ...signals,
      hasRunningAgent: true,
      remainingWork: 1,
    });

    expect(info.stage).toBe('running');
  });
});
