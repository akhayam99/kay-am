import type { ProjectId, SessionId } from '@goodboy/types';
import type { AppState } from '../../types';
import { selectActiveProjectId } from '../project-mounts/selectors';

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

export const isActiveSessionProject = ({ state, sessionId, projectId }: Params): boolean =>
  selectActiveProjectId({ state, sessionId }) === projectId;
