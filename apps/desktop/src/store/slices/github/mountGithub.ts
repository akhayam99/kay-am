import type {
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  ProjectId,
  PullRequestState,
  SessionId,
} from '@goodboy/types';
import type { AppState, MountGithubState, SessionGithubState } from '../../types';
import { sessionMountTargets } from '../project-mounts/mountRequests';
import { selectActiveMountId } from '../project-mounts/selectors';

export type GithubProjection = Pick<
  AppState,
  'sessionGithub' | 'sessionProjectPrs' | 'sessionSelectedPrNumber'
>;

export type GithubWrite = GithubProjection & Pick<AppState, 'mountGithub' | 'mountSelectedPr'>;

type ProjectionState = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'mountGithub'
  | 'mountSelectedPr'
>;

type LinkParams = {
  readonly link: MountPullRequestLink;
};

type ProjectionParams = {
  readonly state: ProjectionState & GithubProjection;
  readonly sessionId: SessionId;
};

const isPullRequestState = (value: unknown): value is PullRequestState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record.number === 'number' &&
    typeof record.title === 'string' &&
    typeof record.url === 'string' &&
    typeof record.state === 'string'
  );
};

export const pullRequestFromLink = ({ link }: LinkParams): PullRequestState | null =>
  isPullRequestState(link.snapshot) ? link.snapshot : null;

const toSessionGithub = (mount: MountGithubState): SessionGithubState => ({
  pr: mount.pr,
  linkedIssues: mount.linkedIssues,
  fetchedAt: mount.fetchedAt,
  failedAt: mount.failedAt,
  loading: mount.loading,
  error: mount.error,
  detail: mount.detail,
  detailFetchedAt: mount.detailFetchedAt,
  detailLoading: mount.detailLoading,
  detailError: mount.detailError,
});

export const deriveGithubProjection = ({
  state,
  sessionId,
}: ProjectionParams): GithubProjection => {
  const projectPrs: Record<ProjectId, ReadonlyArray<PullRequestState>> = {};
  for (const view of sessionMountTargets({ state, sessionId })) {
    const mount = (state.mountGithub ?? {})[view.id];
    if (mount === undefined) {
      continue;
    }
    const merged = [...(projectPrs[view.projectId] ?? [])];
    for (const request of mount.prs) {
      if (!merged.some((candidate) => candidate.url === request.url)) {
        merged.push(request);
      }
    }
    projectPrs[view.projectId] = merged;
  }
  const activeMountId = selectActiveMountId({ state, sessionId });
  const active = activeMountId === null ? undefined : (state.mountGithub ?? {})[activeMountId];
  const identity =
    activeMountId === null ? null : ((state.mountSelectedPr ?? {})[activeMountId] ?? null);
  const sessionGithub = { ...state.sessionGithub };
  const sessionSelectedPrNumber = { ...state.sessionSelectedPrNumber };
  if (active === undefined) {
    delete sessionGithub[sessionId];
    delete sessionSelectedPrNumber[sessionId];
  } else {
    sessionGithub[sessionId] = toSessionGithub(active);
    sessionSelectedPrNumber[sessionId] =
      identity === null || identity.prNumber === active.pr?.number ? null : identity.prNumber;
  }
  return {
    sessionGithub,
    sessionProjectPrs: { ...state.sessionProjectPrs, [sessionId]: projectPrs },
    sessionSelectedPrNumber,
  };
};

type ApplyParams = {
  readonly state: ProjectionState & GithubProjection;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly github?: MountGithubState | null;
  readonly selected?: MountPullRequestIdentity | null;
};

export const applyMountGithub = ({
  state,
  sessionId,
  mountId,
  github,
  selected,
}: ApplyParams): GithubWrite => {
  const mountGithub = { ...state.mountGithub };
  if (github === null) {
    delete mountGithub[mountId];
  } else if (github !== undefined) {
    mountGithub[mountId] = github;
  }
  const mountSelectedPr =
    selected === undefined
      ? state.mountSelectedPr
      : { ...state.mountSelectedPr, [mountId]: selected };
  const projected = { ...state, mountGithub, mountSelectedPr };
  return {
    mountGithub,
    mountSelectedPr,
    ...deriveGithubProjection({ state: projected, sessionId }),
  };
};
