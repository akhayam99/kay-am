import type { SessionWorktree } from '@goodboy/db';
import type { MountId, Project, SessionProjectMount } from '@goodboy/types';

type Params = {
  readonly projects: ReadonlyArray<Project>;
  readonly rows: ReadonlyArray<SessionWorktree>;
};

export const buildSessionProjectMounts = ({
  projects,
  rows,
}: Params): ReadonlyArray<SessionProjectMount> =>
  rows.flatMap((row) => {
    if (row.projectId === undefined) {
      return [];
    }
    const project = projects.find((candidate) => candidate.id === row.projectId);
    if (project === undefined) {
      return [];
    }
    return [
      {
        mountId: row.id as MountId,
        projectId: row.projectId,
        mountName: row.mountName ?? project.name,
        worktreePath: row.worktreePath,
        repoRoot: project.rootPath,
        branch: row.branch,
      },
    ];
  });
