import type { SessionProjectMount } from '@goodboy/types';
import { gitCommonDirectory } from '../../../features/worktree/worktree';

type BuildParams = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly workingDir: string;
  readonly gitDirs: ReadonlyMap<string, string>;
};

const isWritable = (mount: SessionProjectMount): boolean =>
  mount.branch !== '' && mount.isAttached !== false && mount.worktreePath !== '';

export const repoRootsForTurn = ({
  mounts,
}: {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
}): ReadonlyArray<string> =>
  Array.from(new Set(mounts.filter(isWritable).map((mount) => mount.repoRoot)));

export const buildTurnWritableRoots = ({
  mounts,
  workingDir,
  gitDirs,
}: BuildParams): ReadonlyArray<string> => {
  const writable = mounts.filter(isWritable);
  const siblings = writable
    .filter((mount) => mount.worktreePath !== workingDir)
    .map((mount) => mount.worktreePath);
  const metadata = writable.map((mount) => gitDirs.get(mount.repoRoot) ?? `${mount.repoRoot}/.git`);
  return Array.from(new Set([...siblings, ...metadata]));
};

export const resolveGitCommonDirs = async ({
  repoRoots,
}: {
  readonly repoRoots: ReadonlyArray<string>;
}): Promise<ReadonlyMap<string, string>> => {
  const resolved = new Map<string, string>();
  for (const repoRoot of repoRoots) {
    try {
      const found = await gitCommonDirectory({ repoPath: repoRoot });
      if (found !== null && found !== '') {
        resolved.set(repoRoot, found);
      }
    } catch {
      continue;
    }
  }
  return resolved;
};
