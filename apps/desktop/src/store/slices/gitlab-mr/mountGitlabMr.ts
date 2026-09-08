import type { MountId, SessionId } from '@goodboy/types';
import type { AppState, MountGitlabMrState, SessionGitlabMrState } from '../../types';
import { selectActiveMountId } from '../project-mounts/selectors';

export type GitlabProjection = Pick<AppState, 'sessionGitlabMr'>;

export type GitlabWrite = GitlabProjection & Pick<AppState, 'mountGitlabMr'>;

type ProjectionState = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'mountGitlabMr'
> &
  GitlabProjection;

type ProjectionParams = {
  readonly state: ProjectionState;
  readonly sessionId: SessionId;
};

type ApplyParams = ProjectionParams & {
  readonly mountId: MountId;
  readonly gitlab: MountGitlabMrState | null;
};

const toSessionGitlabMr = (mount: MountGitlabMrState): SessionGitlabMrState => ({
  mr: mount.mr,
  fetchedAt: mount.fetchedAt,
  loading: mount.loading,
  error: mount.error,
});

export const deriveGitlabProjection = ({
  state,
  sessionId,
}: ProjectionParams): GitlabProjection => {
  const activeMountId = selectActiveMountId({ state, sessionId });
  const active = activeMountId === null ? undefined : (state.mountGitlabMr ?? {})[activeMountId];
  const sessionGitlabMr = { ...state.sessionGitlabMr };
  if (active === undefined) {
    delete sessionGitlabMr[sessionId];
  } else {
    sessionGitlabMr[sessionId] = toSessionGitlabMr(active);
  }
  return { sessionGitlabMr };
};

export const applyMountGitlabMr = ({
  state,
  sessionId,
  mountId,
  gitlab,
}: ApplyParams): GitlabWrite => {
  const mountGitlabMr = { ...state.mountGitlabMr };
  if (gitlab === null) {
    delete mountGitlabMr[mountId];
  } else {
    mountGitlabMr[mountId] = gitlab;
  }
  const projected = { ...state, mountGitlabMr };
  return {
    mountGitlabMr,
    ...deriveGitlabProjection({ state: projected, sessionId }),
  };
};
