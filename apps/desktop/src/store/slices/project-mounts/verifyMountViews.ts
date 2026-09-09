import type { SessionId, SessionMountView } from '@goodboy/types';
import { loadMountViews } from './mountViews';
import { verifyAvailableWorktrees } from './verifyAvailableWorktrees';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly views: ReadonlyArray<SessionMountView>;
};

export const verifyMountViews = async ({
  get,
  sessionId,
  views,
}: Params): Promise<ReadonlyArray<SessionMountView>> => {
  const projects = get().projects;
  const available = await verifyAvailableWorktrees({
    sessionId,
    candidates: views.flatMap((view) =>
      view.worktreePath === null || !view.isAttached ? [] : [view],
    ),
    projects,
  });
  const availableIds = new Set(available.map((view) => view.id));
  return (await loadMountViews({ get, sessionId })).map((view) => {
    const project = projects.find((candidate) => candidate.id === view.projectId);
    if (
      view.worktreePath === null ||
      !view.isAttached ||
      project?.kind !== 'repo' ||
      availableIds.has(view.id)
    ) {
      return view;
    }
    return { ...view, isAttached: false, diskState: 'unchecked' };
  });
};
