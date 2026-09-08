import type { PullRequestState, SessionId } from '@goodboy/types';
import { resolveSessionRepo } from '../worktrees/resolveSessionRepo';
import type { AppState } from '../../types';

const EMPTY_PRS: ReadonlyArray<PullRequestState> = [];

type State = Pick<
  AppState,
  | 'sessions'
  | 'projects'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'sessionProjectPrs'
>;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
};

export const selectActiveProjectPrs = ({
  state,
  sessionId,
}: Params): ReadonlyArray<PullRequestState> => {
  const repo = resolveSessionRepo({ state, sessionId });
  if (repo === null) {
    return EMPTY_PRS;
  }
  return state.sessionProjectPrs[sessionId]?.[repo.projectId] ?? EMPTY_PRS;
};
