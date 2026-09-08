import { getResolveCandidate, insertResolveCheckRun, listResolveQueueItems } from '@goodboy/db';
import type {
  ResolveCandidate,
  ResolveCheckOutcome,
  ResolveCheckRun,
  SessionId,
  WorktreeStatus,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  sessionDirExists,
  worktreeScratchAdd,
  worktreeScratchRemove,
  worktreeStatus,
} from '../../../features/worktree/worktree';
import { acceptedItemIds } from '../../../features/resolve/acceptedItemIds';
import { withCandidateLock } from './candidateLock';
import { loadResolveCandidatesInto } from './loadResolveCandidatesInto';
import type { CheckRunParams, GetFn, SliceParams } from './types';

type Params = SliceParams & CheckRunParams;

export const NO_CANDIDATE = 'That proposal is gone, so there is nothing to check';
export const UNATTRIBUTABLE_TREE =
  'The tree under this run is neither the current code nor the proposal, so a run here would prove nothing';
export const TREE_MOVED = 'The tree moved while the check ran, so nothing was recorded';
export const DEPENDENCIES_ABSENT =
  'The proposal cannot be checked outside the worktree until its dependencies are installed there';

const DEPENDENCY_DIRS = ['node_modules', 'vendor', '.venv'] as const;

export type ResolveCheckPair = {
  readonly base: ResolveCheckRun | null;
  readonly candidate: ResolveCheckRun | null;
  readonly unprovable: string | null;
};

type TreeRun = {
  readonly exitCode: number;
  readonly durationMs: number;
  readonly logRef: string;
  readonly startedAt: number;
};

const isSettledAt = ({
  status,
  sha,
}: {
  readonly status: WorktreeStatus | null;
  readonly sha: string;
}): boolean => {
  if (status === null || status.head !== sha || status.inProgress !== null) {
    return false;
  }
  const tree = status.workingTree;
  if (tree.kind !== 'known') {
    return false;
  }
  return tree.staged + tree.unstaged + tree.unmerged === 0;
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

type RunParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly path: string;
  readonly expectedSha: string;
  readonly scriptId: string;
  readonly name: string;
  readonly command: string;
};

const runInWorktree = async ({
  get,
  sessionId,
  path,
  expectedSha,
  scriptId,
  name,
  command,
}: RunParams): Promise<TreeRun> => {
  const before = await worktreeStatus({ worktreePath: path }).catch(() => null);
  if (!isSettledAt({ status: before, sha: expectedSha })) {
    throw new Error(UNATTRIBUTABLE_TREE);
  }
  const startedAt = Date.now();
  const result = await get().runDiscoveredScript({
    sessionId,
    scriptId,
    name,
    command,
    cwd: path,
  });
  const after = await worktreeStatus({ worktreePath: path }).catch(() => null);
  if (!isSettledAt({ status: after, sha: expectedSha })) {
    throw new Error(TREE_MOVED);
  }
  return {
    exitCode: result.exitCode,
    durationMs: Date.now() - startedAt,
    logRef: scriptId,
    startedAt,
  };
};

const hasSameDependencies = async ({
  sessionPath,
  scratchPath,
}: {
  readonly sessionPath: string;
  readonly scratchPath: string;
}): Promise<boolean> => {
  for (const dir of DEPENDENCY_DIRS) {
    const inSession = await sessionDirExists({ path: `${sessionPath}/${dir}` }).catch(() => false);
    if (!inSession) {
      continue;
    }
    const inScratch = await sessionDirExists({ path: `${scratchPath}/${dir}` }).catch(() => false);
    if (!inScratch) {
      return false;
    }
  }
  return true;
};

type ScratchParams = Omit<RunParams, 'path'> & {
  readonly candidate: ResolveCandidate;
};

const runInScratch = async ({
  get,
  sessionId,
  candidate,
  expectedSha,
  scriptId,
  name,
  command,
}: ScratchParams): Promise<TreeRun | null> => {
  const scratchPath = await worktreeScratchAdd({
    worktreePath: candidate.worktreePath,
    sha: expectedSha,
    slug: `${candidate.id}-${expectedSha}`,
  });
  try {
    const isEquivalent = await hasSameDependencies({
      sessionPath: candidate.worktreePath,
      scratchPath,
    });
    if (!isEquivalent) {
      return null;
    }
    return await runInWorktree({
      get,
      sessionId,
      path: scratchPath,
      expectedSha,
      scriptId,
      name,
      command,
    });
  } finally {
    await worktreeScratchRemove({
      worktreePath: candidate.worktreePath,
      scratchPath,
    }).catch(() => undefined);
  }
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
}: Params): Promise<ResolveCheckPair> => {
  const db = tauriDatabase;
  const candidate = await getResolveCandidate({ db, candidateId });
  if (candidate === null) {
    throw new Error(NO_CANDIDATE);
  }
  const acceptedSet = acceptedItemIds({ entries: await listResolveQueueItems({ db, sessionId }) });
  const receiptOf = ({
    run,
    candidateTree,
  }: {
    readonly run: TreeRun;
    readonly candidateTree: string | null;
  }): ResolveCheckRun => ({
    id: crypto.randomUUID(),
    sessionId,
    candidateId,
    command,
    testIdentity: testIdentity ?? null,
    breadth,
    baseTree: candidate.baseSha,
    candidateTree,
    acceptedSet,
    outcome: outcomeOf({ exitCode: run.exitCode }),
    exitCode: run.exitCode,
    durationMs: run.durationMs,
    logRef: run.logRef,
    createdAt: run.startedAt,
  });

  const pair = await withCandidateLock({
    worktreePath: candidate.worktreePath,
    holder: `check:${candidate.id}`,
    run: async (): Promise<ResolveCheckPair> => {
      const session = await worktreeStatus({ worktreePath: candidate.worktreePath }).catch(
        () => null,
      );
      const isSessionOnCandidate =
        candidate.integratedSha !== null &&
        isSettledAt({ status: session, sha: candidate.integratedSha });
      const isSessionOnBase = isSettledAt({ status: session, sha: candidate.baseSha });
      if (!isSessionOnBase && !isSessionOnCandidate) {
        throw new Error(UNATTRIBUTABLE_TREE);
      }
      const stamp = Date.now();
      const baseRun = isSessionOnBase
        ? await runInWorktree({
            get,
            sessionId,
            path: candidate.worktreePath,
            expectedSha: candidate.baseSha,
            scriptId: `resolve-check:${candidateId}:base:${stamp}`,
            name,
            command,
          })
        : await runInScratch({
            get,
            sessionId,
            candidate,
            expectedSha: candidate.baseSha,
            scriptId: `resolve-check:${candidateId}:base:${stamp}`,
            name,
            command,
          });
      const candidateRun = isSessionOnCandidate
        ? await runInWorktree({
            get,
            sessionId,
            path: candidate.worktreePath,
            expectedSha: candidate.integratedSha ?? candidate.candidateSha,
            scriptId: `resolve-check:${candidateId}:candidate:${stamp}`,
            name,
            command,
          })
        : await runInScratch({
            get,
            sessionId,
            candidate,
            expectedSha: candidate.candidateSha,
            scriptId: `resolve-check:${candidateId}:candidate:${stamp}`,
            name,
            command,
          });
      return {
        base: baseRun === null ? null : receiptOf({ run: baseRun, candidateTree: null }),
        candidate:
          candidateRun === null
            ? null
            : receiptOf({ run: candidateRun, candidateTree: candidate.candidateSha }),
        unprovable: baseRun === null || candidateRun === null ? DEPENDENCIES_ABSENT : null,
      };
    },
  });

  for (const run of [pair.base, pair.candidate]) {
    if (run !== null) {
      await insertResolveCheckRun({ db, run });
    }
  }
  await loadResolveCandidatesInto({ set, sessionId });
  return pair;
};
