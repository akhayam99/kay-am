import type { MountId, MountPullRequestIdentity, SessionId } from '@goodboy/types';
import type { AppState, MountBitbucketPrState } from '../../types';
import { selectActiveMountId } from '../project-mounts/selectors';
import type { SessionBitbucketPrEntry } from './state';

export type BitbucketProjection = Pick<AppState, 'sessionBitbucketPr' | 'sessionBitbucketRepo'>;

export type BitbucketWrite = BitbucketProjection &
  Pick<AppState, 'mountBitbucketPr' | 'mountSelectedBitbucketPr'>;

type ProjectionState = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'mountBitbucketPr'
  | 'mountSelectedBitbucketPr'
> &
  BitbucketProjection;

type ProjectionParams = {
  readonly state: ProjectionState;
  readonly sessionId: SessionId;
};

type ApplyParams = ProjectionParams & {
  readonly mountId: MountId;
  readonly bitbucket?: MountBitbucketPrState | null;
  readonly selected?: MountPullRequestIdentity | null;
};

const toSessionBitbucketPr = (mount: MountBitbucketPrState): SessionBitbucketPrEntry => ({
  pr: mount.pr,
  fetchedAt: mount.fetchedAt,
  loading: mount.loading,
  error: mount.error,
});

export const deriveBitbucketProjection = ({
  state,
  sessionId,
}: ProjectionParams): BitbucketProjection => {
  const activeMountId = selectActiveMountId({ state, sessionId });
  const active = activeMountId === null ? undefined : (state.mountBitbucketPr ?? {})[activeMountId];
  const sessionBitbucketPr = { ...state.sessionBitbucketPr };
  const sessionBitbucketRepo = { ...state.sessionBitbucketRepo };
  if (active === undefined) {
    delete sessionBitbucketPr[sessionId];
    delete sessionBitbucketRepo[sessionId];
    return { sessionBitbucketPr, sessionBitbucketRepo };
  }
  sessionBitbucketPr[sessionId] = toSessionBitbucketPr(active);
  if (active.repo === null) {
    delete sessionBitbucketRepo[sessionId];
  } else {
    sessionBitbucketRepo[sessionId] = active.repo;
  }
  return { sessionBitbucketPr, sessionBitbucketRepo };
};

export const applyMountBitbucketPr = ({
  state,
  sessionId,
  mountId,
  bitbucket,
  selected,
}: ApplyParams): BitbucketWrite => {
  const mountBitbucketPr = { ...state.mountBitbucketPr };
  if (bitbucket === null) {
    delete mountBitbucketPr[mountId];
  } else if (bitbucket !== undefined) {
    mountBitbucketPr[mountId] = bitbucket;
  }
  const mountSelectedBitbucketPr =
    selected === undefined
      ? state.mountSelectedBitbucketPr
      : { ...state.mountSelectedBitbucketPr, [mountId]: selected };
  const projected = { ...state, mountBitbucketPr, mountSelectedBitbucketPr };
  return {
    mountBitbucketPr,
    mountSelectedBitbucketPr,
    ...deriveBitbucketProjection({ state: projected, sessionId }),
  };
};
