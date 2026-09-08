import { decodeStateReason, type ResolveFailurePrefix } from '../review/stateReason';
import type { ResolveChecksVerdict } from './checkReceipts';

export const RESOLVE_ITEM_LABEL = {
  reviewerSaid: 'The reviewer said',
  alsoCovered: 'Also covered by this proposal',
  proposal: 'What the agent says it did',
  claim: 'Agent claim, not checked here',
  change: 'The change',
  checks: 'Checks',
  decision: 'Your decision',
  replyPreview: 'This exact text goes back to the reviewer',
  openInDiff: 'Open in diff',
  backToResolve: 'Back to Resolve',
  runBothTrees: 'Run the check on the current code and on the proposal',
  checkRunning: 'Running on both trees',
  machineVerified: 'Machine verified',
  stale: 'Stale',
  stop: 'Stop',
} as const;

export const checksHeadline = ({ verdict }: { readonly verdict: ResolveChecksVerdict }): string => {
  const headline: Record<ResolveChecksVerdict['kind'], string> = {
    nothing_ran: 'Nothing ran against this proposal',
    all_stale: 'Every run is stale, so nothing here is proven',
    proves_the_fix: 'Fails on the current code, passes on the proposal',
    passes_without_base_run: 'Passes on the proposal. It never ran on the current code',
    passes_on_both: 'Passes on the proposal and on the current code, so it proves nothing',
    fails_on_the_proposal: 'Fails on the proposal',
    base_only: 'Only the current code was checked, never the proposal',
  };
  return headline[verdict.kind];
};

export const scopedRunNote = 'A scoped run, not the full suite.';

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
  command,
  testIdentity,
  durationMs,
}: {
  readonly tree: 'base' | 'candidate';
  readonly command: string;
  readonly testIdentity: string | null;
  readonly durationMs: number;
}): string => {
  const where = tree === 'base' ? 'on the current code' : 'on the proposal';
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const identity = testIdentity === null ? command : `${command} · ${testIdentity}`;
  return `${identity} ${where}, ${seconds}s`;
};

export const changeSummaryLine = ({
  fileCount,
  changedLines,
}: {
  readonly fileCount: number;
  readonly changedLines: number;
}): string =>
  `${fileCount} ${fileCount === 1 ? 'file' : 'files'} · ${changedLines} changed ${changedLines === 1 ? 'line' : 'lines'}`;

export const hiddenFilesLine = ({ count }: { readonly count: number }): string =>
  count === 1 ? '1 more file is only in the diff' : `${count} more files are only in the diff`;
