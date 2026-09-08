import type { ProjectId, SessionId } from '@goodboy/types';
import type { AppState } from '../../types';
import { selectUnambiguousProjectMount } from '../project-mounts/selectors';

type State = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
>;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
};

export const resolveProjectMountPath = ({ state, sessionId, projectId }: Params): string | null => {
  const session = state.sessions?.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return null;
  }
  return selectUnambiguousProjectMount({ state, sessionId, projectId })?.worktreePath ?? null;
};
