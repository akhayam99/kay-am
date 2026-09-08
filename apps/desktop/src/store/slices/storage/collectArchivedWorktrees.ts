import { listArchivedSessionMounts } from '@goodboy/db';
import type { Project, SessionMount } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { worktreeDirectorySize, worktreeList } from '../../../features/worktree/worktree';
import type { ArchivedWorktreeTarget } from './types';

type Params = {
  readonly projects: ReadonlyArray<Project>;
};

const isBranchless = (mount: SessionMount): boolean => mount.branch.trim() === '';

const listLiveWorktrees = async (
  repoPaths: ReadonlySet<string>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> => {
  const live = new Map<string, ReadonlySet<string>>();
  for (const repoPath of repoPaths) {
    try {
      const entries = await worktreeList(repoPath);
      const known = new Set<string>();
      for (const entry of entries) {
        if (entry.isMain) {
          continue;
        }
        known.add(entry.path);
      }
      live.set(repoPath, known);
    } catch {
      live.set(repoPath, new Set());
    }
  }
  return live;
};

export const collectArchivedWorktrees = async ({
  projects,
}: Params): Promise<ReadonlyArray<ArchivedWorktreeTarget>> => {
  const mounts = await listArchivedSessionMounts(tauriDatabase);
  if (mounts.length === 0) {
    return [];
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const candidates: Array<ArchivedWorktreeTarget> = [];
  for (const mount of mounts) {
    const project = mount.projectId === null ? undefined : projectById.get(mount.projectId);
    const worktreePath = mount.worktreePath;
    if (worktreePath === null || isBranchless(mount) || project?.kind !== 'repo') {
      continue;
    }
    candidates.push({
      sessionId: mount.sessionId,
      mountId: mount.id,
      repoPath: project.rootPath,
      worktreePath,
      branch: mount.branch,
      revision: mount.revision,
      sizeBytes: null,
    });
  }

  const live = await listLiveWorktrees(new Set(candidates.map((target) => target.repoPath)));
  const present = candidates.filter((target) =>
    (live.get(target.repoPath) ?? new Set<string>()).has(target.worktreePath),
  );
  return Promise.all(
    present.map(async (target) => {
      const size = await worktreeDirectorySize({ path: target.worktreePath }).catch(() => null);
      return { ...target, sizeBytes: size?.sizeBytes ?? null };
    }),
  );
};
