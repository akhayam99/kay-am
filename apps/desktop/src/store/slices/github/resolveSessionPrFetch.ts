import type { Session, SessionId } from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { resolveSessionRepo, type SessionRepo } from '../worktrees/resolveSessionRepo';
import type { AppState } from '../../types';

type State = Pick<
  AppState,
  | 'sessions'
  | 'workspaces'
  | 'projects'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'sessionWorktrees'
  | 'sessionBranches'
>;

export type SessionPrFetch = Readonly<{
  session: Session;
  repo: SessionRepo;
}>;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
};

export const resolveSessionPrFetch = ({ state, sessionId }: Params): SessionPrFetch | null => {
  const branch = state.sessionBranches[sessionId];
  if (!branch) {
    return null;
  }
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (session == null) {
    return null;
  }
  const workspace = state.workspaces.find((candidate) => candidate.id === session.workspaceId);
  if (workspace == null || isBranchlessSession({ branch })) {
    return null;
  }
  const repo = resolveSessionRepo({ state, sessionId });
  if (repo == null) {
    return null;
  }
  return { session, repo };
};

export const isSessionPrFetchable = (params: Params): boolean =>
  resolveSessionPrFetch(params) !== null;
