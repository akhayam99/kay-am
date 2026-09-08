import type { ReviewablePrProvider, SessionExternalTask, SessionId } from '@goodboy/types';
import { PROVIDER_PRIORITY } from '../../../features/session/components/SessionWorkspace/parts/resolvePullRequestProvider';
import { selectActiveProjectPrs } from '../github/activeProjectPrs';
import type { AppState } from '../../types';

export type ReviewTarget = {
  readonly provider: ReviewablePrProvider;
  readonly repo: string;
  readonly prNumber: number;
};

type ReviewableTask = SessionExternalTask & { readonly provider: ReviewablePrProvider };

const isReviewableTask = (task: SessionExternalTask): task is ReviewableTask =>
  task.provider === 'github' || task.provider === 'gitlab';

const GITLAB_MR_PATH = '/-/merge_requests/';

type PathParams = {
  readonly pathname: string;
};

const gitlabRepoFromPath = ({ pathname }: PathParams): string | null => {
  const [projectPart, mrPart] = pathname.split(GITLAB_MR_PATH);
  if (mrPart === undefined) {
    return null;
  }
  const trimmed = (projectPart ?? '').replace(/^\/+|\/+$/g, '');
  return trimmed.length > 0 ? trimmed : null;
};

const githubRepoFromPath = ({ pathname }: PathParams): string | null => {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const [owner, name, kind] = segments;
  if (owner === undefined || name === undefined || kind !== 'pull') {
    return null;
  }
  return `${owner}/${name}`;
};

type UrlParams = {
  readonly provider: ReviewablePrProvider;
  readonly url: string;
  readonly prNumber: number;
};

const pathnameOf = ({ url }: { readonly url: string }): string | null => {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

const targetFromUrl = ({ provider, url, prNumber }: UrlParams): ReviewTarget | null => {
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return null;
  }
  const pathname = pathnameOf({ url });
  if (pathname == null) {
    return null;
  }
  const repo =
    provider === 'gitlab' ? gitlabRepoFromPath({ pathname }) : githubRepoFromPath({ pathname });
  return repo == null ? null : { provider, repo, prNumber };
};

type TargetFromTaskParams = {
  readonly task: ReviewableTask;
};

const targetFromTask = ({ task }: TargetFromTaskParams): ReviewTarget | null =>
  targetFromUrl({
    provider: task.provider,
    url: task.url,
    prNumber: Number.parseInt(task.externalId, 10),
  });

const byProviderThenNumber = (left: ReviewTarget, right: ReviewTarget): number => {
  const rank = PROVIDER_PRIORITY.indexOf(left.provider) - PROVIDER_PRIORITY.indexOf(right.provider);
  if (rank !== 0) {
    return rank;
  }
  return left.prNumber - right.prNumber;
};

export type ReviewTargetState = Pick<
  AppState,
  | 'sessionExternalTasks'
  | 'sessionGithub'
  | 'sessionGitlabMr'
  | 'sessions'
  | 'projects'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'sessionProjectPrs'
>;

type Params = {
  readonly state: ReviewTargetState;
  readonly sessionId: SessionId;
};

const ownReviewTargets = ({ state, sessionId }: Params): ReadonlyArray<ReviewTarget> => {
  const pullRequest =
    state.sessionGithub[sessionId]?.pr ?? selectActiveProjectPrs({ state, sessionId })[0] ?? null;
  const mergeRequest = state.sessionGitlabMr[sessionId]?.mr ?? null;
  const candidates = [
    pullRequest == null
      ? null
      : targetFromUrl({ provider: 'github', url: pullRequest.url, prNumber: pullRequest.number }),
    mergeRequest == null
      ? null
      : targetFromUrl({ provider: 'gitlab', url: mergeRequest.webUrl, prNumber: mergeRequest.iid }),
  ];
  return candidates
    .filter((candidate): candidate is ReviewTarget => candidate != null)
    .sort(byProviderThenNumber);
};

const linkedReviewTargets = ({ state, sessionId }: Params): ReadonlyArray<ReviewTarget> =>
  (state.sessionExternalTasks[sessionId] ?? [])
    .filter(isReviewableTask)
    .flatMap((task) => {
      const target = targetFromTask({ task });
      return target == null ? [] : [target];
    })
    .sort(byProviderThenNumber);

export const resolveReviewTarget = ({ state, sessionId }: Params): ReviewTarget | null =>
  ownReviewTargets({ state, sessionId })[0] ?? linkedReviewTargets({ state, sessionId })[0] ?? null;
