import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  ProjectId,
  PullRequestState,
  SessionEventPayload,
} from '@goodboy/types';

type IdentityParams = {
  readonly repository: string;
  readonly pr: PullRequestState;
};

type LinkParams = IdentityParams & {
  readonly mountId: MountId;
  readonly existing: MountPullRequestLink | null;
  readonly observedAt: IsoDateTime;
};

type PayloadParams = {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
  readonly identity: MountPullRequestIdentity;
  readonly title: string;
  readonly url: string;
  readonly branch?: string;
};

type HostParams = {
  readonly url: string;
};

export const requestHost = ({ url }: HostParams): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'github.com';
  }
};

export const githubRequestIdentity = ({
  repository,
  pr,
}: IdentityParams): MountPullRequestIdentity => ({
  provider: 'github',
  host: requestHost({ url: pr.url }),
  repoSlug: repository,
  prNumber: pr.number,
});

export const toMountPullRequestLink = ({
  mountId,
  repository,
  pr,
  existing,
  observedAt,
}: LinkParams): MountPullRequestLink => ({
  id: existing?.id ?? crypto.randomUUID(),
  mountId,
  ...githubRequestIdentity({ repository, pr }),
  headBranch: pr.headBranch,
  baseBranch: pr.baseBranch,
  url: pr.url,
  state: pr.state,
  snapshot: pr,
  lastObservedAt: observedAt,
  createdAt: existing?.createdAt ?? observedAt,
  updatedAt: observedAt,
});

export const mountPrEventPayload = ({
  mountId,
  projectId,
  identity,
  title,
  url,
  branch,
}: PayloadParams): SessionEventPayload => ({
  mountId,
  projectId,
  provider: identity.provider,
  host: identity.host,
  repository: identity.repoSlug,
  number: identity.prNumber,
  title,
  url,
  ...(branch === undefined ? {} : { branch }),
});
