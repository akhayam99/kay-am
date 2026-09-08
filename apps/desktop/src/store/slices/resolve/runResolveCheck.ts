import { getResolveCandidate, insertResolveCheckRun, listResolveQueueItems } from '@goodboy/db';
import type { ResolveCheckOutcome, ResolveCheckRun, WorktreeStatus } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { worktreeStatus } from '../../../features/worktree/worktree';
import { acceptedItemIds } from '../../../features/resolve/acceptedItemIds';
import { loadResolveCandidatesInto } from './loadResolveCandidatesInto';
import type { CheckRunParams, SliceParams } from './types';

type Params = SliceParams & CheckRunParams;

export const NO_CANDIDATE = 'That proposal is gone, so there is nothing to check';
export const UNATTRIBUTABLE_TREE =
  'The working tree is not the base or the proposal, so a run here would prove nothing';
export const TREE_MOVED = 'The tree moved while the check ran, so nothing was recorded';

type TreeParams = {
  readonly status: WorktreeStatus | null;
  readonly baseSha: string;
  readonly integratedSha: string | null;
};

const isSettled = ({ status }: { readonly status: WorktreeStatus | null }): boolean => {
  if (status === null) {
    return false;
  }
  const tree = status.workingTree;
  if (tree.kind !== 'known') {
    return false;
  }
  return tree.staged + tree.unstaged + tree.unmerged === 0 && status.inProgress === null;
};

const treeUnderTest = ({
  status,
  baseSha,
  integratedSha,
}: TreeParams): 'base' | 'candidate' | null => {
  if (!isSettled({ status }) || status === null || status.head === null) {
    return null;
  }
  if (integratedSha !== null && status.head === integratedSha) {
    return 'candidate';
  }
  if (status.head === baseSha) {
    return 'base';
  }
  return null;
};

const outcomeOf = ({ exitCode }: { readonly exitCode: number }): ResolveCheckOutcome => {
  if (exitCode === 0) {
    return 'passed';
  }
  if (exitCode < 0) {
    return 'errored';
  }
  return 'failed';
};

export const runResolveCheck = async ({
  set,
  get,
  sessionId,
  candidateId,
  command,
  name,
  testIdentity,
  breadth,
}: Params): Promise<ResolveCheckRun> => {
  const db = tauriDatabase;
  const candidate = await getResolveCandidate({ db, candidateId });
  if (candidate === null) {
    throw new Error(NO_CANDIDATE);
  }
  const before = await worktreeStatus({ worktreePath: candidate.worktreePath }).catch(() => null);
  const tree = treeUnderTest({
    status: before,
    baseSha: candidate.baseSha,
    integratedSha: candidate.integratedSha,
  });
  if (tree === null) {
    throw new Error(UNATTRIBUTABLE_TREE);
  }
  const acceptedSet = acceptedItemIds({ entries: await listResolveQueueItems({ db, sessionId }) });
  const runId = crypto.randomUUID();
  const scriptId = `resolve-check:${candidateId}:${runId}`;
  const startedAt = Date.now();
  const result = await get().runDiscoveredScript({
    sessionId,
    scriptId,
    name,
    command,
    cwd: candidate.worktreePath,
  });
  const durationMs = Date.now() - startedAt;
  const after = await worktreeStatus({ worktreePath: candidate.worktreePath }).catch(() => null);
  if (
    treeUnderTest({
      status: after,
      baseSha: candidate.baseSha,
      integratedSha: candidate.integratedSha,
    }) !== tree
  ) {
    throw new Error(TREE_MOVED);
  }
  const run: ResolveCheckRun = {
    id: runId,
    sessionId,
    candidateId,
    command,
    testIdentity: testIdentity ?? null,
    breadth,
    baseTree: candidate.baseSha,
    candidateTree: tree === 'candidate' ? candidate.candidateSha : null,
    acceptedSet,
    outcome: outcomeOf({ exitCode: result.exitCode }),
    exitCode: result.exitCode,
    durationMs,
    logRef: scriptId,
    createdAt: startedAt,
  };
  await insertResolveCheckRun({ db, run });
  await loadResolveCandidatesInto({ set, sessionId });
  return run;
};
