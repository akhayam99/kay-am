import type { BranchCommit } from '@goodboy/types';
import { worktreeIsAncestor } from '../../../features/worktree/worktree';
import type { ApprovedPublicationScope } from './approvedPublicationScope';

type Params = {
  readonly worktreePath: string;
  readonly commits: ReadonlyArray<BranchCommit>;
  readonly scope: ApprovedPublicationScope;
};

type CoverParams = {
  readonly worktreePath: string;
  readonly sha: string;
  readonly scope: ApprovedPublicationScope;
};

const isCovered = async ({ worktreePath, sha, scope }: CoverParams): Promise<boolean> => {
  if (scope.shas.has(sha)) {
    return true;
  }
  for (const range of scope.ranges) {
    const isBelowTip = await worktreeIsAncestor({
      worktreePath,
      sha,
      head: range.integratedSha,
    }).catch(() => false);
    if (!isBelowTip) {
      continue;
    }
    const isAlreadyInBase = await worktreeIsAncestor({
      worktreePath,
      sha,
      head: range.baseSha,
    }).catch(() => false);
    if (!isAlreadyInBase) {
      return true;
    }
  }
  return false;
};

export const unapprovedBranchCommits = async ({
  worktreePath,
  commits,
  scope,
}: Params): Promise<ReadonlyArray<BranchCommit>> => {
  const verdicts = await Promise.all(
    commits.map((commit) => isCovered({ worktreePath, sha: commit.sha, scope })),
  );
  return commits.filter((_, index) => verdicts[index] !== true);
};
