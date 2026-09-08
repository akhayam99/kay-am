import { listSessionMounts } from '@goodboy/db';
import type { MountId, SessionId, SessionMountView, SessionProjectMount } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { mountError } from './mountErrors';
import type { GetFn, SetFn } from './types';

type LoadParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
};

export const loadMountViews = async ({
  get,
  sessionId,
}: LoadParams): Promise<ReadonlyArray<SessionMountView>> => {
  const mounts = await listSessionMounts({ db: tauriDatabase, sessionId });
  const projects = get().projects;
  return mounts.flatMap((mount) => {
    const projectId = mount.projectId;
    if (projectId === null) {
      return [];
    }
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project === undefined) {
      return [];
    }
    return [
      {
        ...mount,
        projectId,
        mountName: mount.mountName ?? project.name,
        repoRoot: project.rootPath,
      },
    ];
  });
};

const toProjectMount = (view: SessionMountView): SessionProjectMount | null => {
  const worktreePath = view.worktreePath;
  if (worktreePath === null || !view.isAttached) {
    return null;
  }
  return {
    mountId: view.id,
    sessionId: view.sessionId,
    projectId: view.projectId,
    mountName: view.mountName,
    worktreePath,
    lastWorktreePath: view.lastWorktreePath,
    repoRoot: view.repoRoot,
    branch: view.branch,
    baseBranch: view.baseBranch,
    parallelIndex: view.parallelIndex,
    isAttached: true,
    diskState: view.diskState,
    revision: view.revision,
  };
};

export const toProjectMounts = (
  views: ReadonlyArray<SessionMountView>,
): ReadonlyArray<SessionProjectMount> =>
  views.flatMap((view) => {
    const mount = toProjectMount(view);
    return mount === null ? [] : [mount];
  });

type ApplyParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly views: ReadonlyArray<SessionMountView>;
};

export const applyMountViews = ({ set, sessionId, views }: ApplyParams): void => {
  const mounts = toProjectMounts(views);
  set((state) => ({
    sessionMounts: { ...state.sessionMounts, [sessionId]: views },
    sessionProjectMounts: { ...state.sessionProjectMounts, [sessionId]: mounts },
    sessionWorktrees: {
      ...state.sessionWorktrees,
      [sessionId]: mounts.map((mount) => mount.worktreePath),
    },
  }));
};

type RequireParams = {
  readonly views: ReadonlyArray<SessionMountView>;
  readonly mountId: MountId;
};

export const requireMountView = ({ views, mountId }: RequireParams): SessionMountView => {
  const view = views.find((candidate) => candidate.id === mountId);
  if (view === undefined) {
    throw mountError({ code: 'mount-missing', message: `mount not found: ${mountId}`, mountId });
  }
  return view;
};
