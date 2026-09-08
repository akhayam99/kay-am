import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  PullRequestState,
} from '@goodboy/types';
import { buildMountRequestLink, requestHost } from '../project-mounts/mountRequests';

type IdentityParams = {
  readonly repository: string;
  readonly pr: PullRequestState;
};

type LinkParams = IdentityParams & {
  readonly mountId: MountId;
  readonly existing: MountPullRequestLink | null;
  readonly observedAt: IsoDateTime;
};

type HostParams = {
  readonly url: string;
};

export const githubRequestHost = ({ url }: HostParams): string =>
  requestHost({ url, fallback: 'github.com' });

export const githubRequestIdentity = ({
  repository,
  pr,
}: IdentityParams): MountPullRequestIdentity => ({
  provider: 'github',
  host: githubRequestHost({ url: pr.url }),
  repoSlug: repository,
  prNumber: pr.number,
});

export const toMountPullRequestLink = ({
  mountId,
  repository,
  pr,
  existing,
  observedAt,
}: LinkParams): MountPullRequestLink =>
  buildMountRequestLink({
    mountId,
    identity: githubRequestIdentity({ repository, pr }),
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    url: pr.url,
    state: pr.state,
    snapshot: pr,
    existing,
    observedAt,
  });
