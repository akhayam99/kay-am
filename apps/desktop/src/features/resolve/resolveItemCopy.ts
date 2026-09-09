import type { ResolveAttempt } from '@goodboy/types';
import { decodeStateReason, type ResolveFailurePrefix } from '../review/stateReason';
import type { ResolveChecksVerdict } from './checkReceipts';

export const RESOLVE_ITEM_LABEL = {
  comment: 'Comment',
  agentQuestion: 'Agent question',
  relatedComments: 'Related comments',
  change: 'Changes',
  checks: 'Checks',
  reply: 'Reply',
  replyPreview: 'Reply to reviewer',
  replyPosted: 'Reply posted',
  refusalReply: 'Reply the reviewer will read',
  refusalNote: 'The reviewer thread stays open',
  noProposal: 'No agent reply yet',
  replyOnlyProposal: 'Reply only, no code change',
  nothingToApprove: 'No fix and no reply to approve yet',
  agentAnswer: 'Answer for agent',
  run: 'Run',
  openInDiff: 'Open diff',
  backToResolve: 'Back to Resolve',
  runBothTrees: 'Run checks',
  checkRunning: 'Checking both trees',
  passed: 'Passed',
  failed: 'Failed',
  stale: 'Stale',
  stop: 'Stop',
  viewWork: 'View work',
  reopen: 'Reopen',
  fixingCommit: 'Fixing commit',
  notRecorded: 'Not recorded',
  candidate: 'Candidate',
  recordedCommits: 'Recorded commits',
  noCapturedChange: 'No captured change',
} as const;

const ATTEMPT_PHASE_LABEL: Record<ResolveAttempt['phase'], string> = {
  queued: 'Queued',
  running: 'Working',
  waiting: 'Waiting',
  finished: 'Finished',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export const attemptPhaseLabel = ({ phase }: { readonly phase: ResolveAttempt['phase'] }): string =>
  ATTEMPT_PHASE_LABEL[phase];

export const checksHeadline = ({ verdict }: { readonly verdict: ResolveChecksVerdict }): string => {
  const headline: Record<ResolveChecksVerdict['kind'], string> = {
    nothing_ran: 'No checks run',
    all_stale: 'Checks out of date',
    proves_the_fix: 'Fails on current code, passes on proposal',
    passes_without_base_run: 'Passes on proposal; current code not checked',
    passes_on_both: 'Passes on both; regression not demonstrated',
    fails_on_the_proposal: 'Fails on proposal',
    base_only: 'Current code checked; proposal not checked',
  };
  return headline[verdict.kind];
};

export const scopedRunNote = 'Scoped checks';

const FAILURE_NOTE: Record<ResolveFailurePrefix, string> = {
  dirty_tree: 'The worktree still held uncommitted changes when this run ended.',
  missing_result: 'The run ended without saying what it did.',
  stopped: 'This run was stopped before it finished.',
  failed: 'This run failed.',
};

export const runNote = ({
  stateReason,
}: {
  readonly stateReason: string | null;
}): string | null => {
  const decoded = decodeStateReason({ stateReason });
  if (decoded.publicationError !== null) {
    return `Publishing failed: ${decoded.publicationError}`;
  }
  return decoded.prefix === null ? null : FAILURE_NOTE[decoded.prefix];
};

export const receiptLine = ({
  tree,
  testIdentity,
  durationMs,
}: {
  readonly tree: 'base' | 'candidate';
  readonly testIdentity: string | null;
  readonly durationMs: number;
}): string => {
  const where = tree === 'base' ? 'on the current code' : 'on the proposal';
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const scope = testIdentity === null ? where : `${testIdentity} ${where}`;
  return `${scope}, ${seconds}s`;
};

export const changeSummaryLine = ({
  fileCount,
  changedLines,
}: {
  readonly fileCount: number;
  readonly changedLines: number;
}): string =>
  `${fileCount} ${fileCount === 1 ? 'file' : 'files'} · ${changedLines} changed ${changedLines === 1 ? 'line' : 'lines'}`;

export const shortSha = ({ sha }: { readonly sha: string }): string => sha.slice(0, 7);
