import type { Project, WorkspaceId } from '@goodboy/types';
import { deleteRetainedWorktreePath } from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import { tauriDatabase } from '../../../shared/lib/db';
import { removeOrphanWorktree } from '../../../features/worktree/worktree';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly workspaceId: WorkspaceId;
  readonly paths: ReadonlyArray<string>;
};

type OwnerParams = {
  readonly projects: ReadonlyArray<Project>;
  readonly path: string;
};

const worktreeOwner = ({ projects, path }: OwnerParams): Project | undefined =>
  projects.find((project) => path.startsWith(`${project.rootPath}/.goodboy/worktrees/`));

export const removeOrphanWorktrees = (set: SetFn, get: GetFn) => {
  return async ({ workspaceId, paths }: Params): Promise<void> => {
    const projects = get().projects.filter(
      (candidate) => candidate.workspaceId === workspaceId && candidate.kind === 'repo',
    );
    if (projects.length === 0) {
      throw new Error(`workspace has no repository project: ${workspaceId}`);
    }
    const retained = get().retainedWorktreePaths[workspaceId] ?? [];
    const failures: Array<string> = [];
    const removed = new Set<string>();
    for (const path of paths) {
      const project = worktreeOwner({ projects, path });
      if (project === undefined) {
        failures.push(`no repository owns ${path}`);
        continue;
      }
      try {
        await removeOrphanWorktree({ repoPath: project.rootPath, path });
        removed.add(path);
        const record = retained.find((candidate) => candidate.worktreePath === path);
        if (record !== undefined) {
          await deleteRetainedWorktreePath({ db: tauriDatabase, id: record.id }).catch(
            () => undefined,
          );
        }
      } catch (error) {
        failures.push(formatError(error));
      }
    }
    set((state) => {
      const next = { ...state.orphanWorktrees };
      next[workspaceId] = (state.orphanWorktrees[workspaceId] ?? []).filter(
        (orphan) => !removed.has(orphan.path),
      );
      return {
        orphanWorktrees: next,
        retainedWorktreePaths: {
          ...state.retainedWorktreePaths,
          [workspaceId]: retained.filter((record) => !removed.has(record.worktreePath)),
        },
      };
    });
    if (failures.length > 0) {
      throw new Error(failures.join('\n'));
    }
  };
};
