import type { SessionId } from '@goodboy/types';
import type { AppState } from '../../types';
import { selectActiveMount } from '../project-mounts/selectors';

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
};

export const resolveActiveMountPath = ({ state, sessionId }: Params): string | null =>
  selectActiveMount({ state, sessionId })?.worktreePath ?? null;
