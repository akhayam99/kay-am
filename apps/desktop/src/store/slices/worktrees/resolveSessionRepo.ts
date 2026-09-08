import type { MountId, ProjectId, SessionId } from '@goodboy/types';
import type { AppState } from '../../types';
import { selectActiveMount, selectWritableMounts } from '../project-mounts/selectors';

export type SessionRepo = Readonly<{
  repoRoot: string;
  worktreePath: string;
  branch: string;
  mountName: string | null;
  projectId: ProjectId;
  mountId: MountId | null;
  revision: number | null;
}>;

type State = Pick<
  AppState,
  | 'sessions'
  | 'projects'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
>;

type ResolveParams = {
  readonly state: State;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

export const resolveSessionRepo = ({
  state,
  sessionId,
  mountId,
}: ResolveParams): SessionRepo | null => {
  const session = state.sessions?.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return null;
  }
  const activeMount =
    mountId === undefined
      ? selectActiveMount({ state, sessionId })
      : (selectWritableMounts({ state, sessionId }).find((mount) => mount.mountId === mountId) ??
        null);
  if (activeMount === null) {
    return null;
  }
  const project = state.projects?.find((candidate) => candidate.id === activeMount.projectId);
  if (project === undefined || project.kind !== 'repo') {
    return null;
  }
  return {
    repoRoot: activeMount.repoRoot,
    worktreePath: activeMount.worktreePath,
    branch: activeMount.branch,
    mountName: activeMount.mountName,
    projectId: activeMount.projectId,
    mountId: activeMount.mountId ?? null,
    revision: activeMount.revision ?? null,
  };
};
