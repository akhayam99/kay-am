import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  MountPullRequestState,
} from '@goodboy/types';
import type { GitlabMergeRequest } from '../../../features/integrations/gitlab/client';
import { buildMountRequestLink, requestHost } from '../project-mounts/mountRequests';

type IdentityParams = {
  readonly host: string;
  readonly projectPath: string;
  readonly mr: GitlabMergeRequest;
};

type LinkParams = IdentityParams & {
  readonly mountId: MountId;
  readonly existing: MountPullRequestLink | null;
  readonly observedAt: IsoDateTime;
};

type SnapshotParams = {
  readonly link: MountPullRequestLink;
};

const isMergeRequest = (value: unknown): value is GitlabMergeRequest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return (
    typeof record.iid === 'number' &&
    typeof record.title === 'string' &&
    typeof record.webUrl === 'string' &&
    typeof record.state === 'string'
  );
};

const gitlabRequestState = ({ mr }: { readonly mr: GitlabMergeRequest }): MountPullRequestState => {
  if (mr.state === 'merged') {
    return 'merged';
  }
  if (mr.state === 'closed') {
    return 'closed';
  }
  return mr.draft ? 'draft' : 'open';
};

export const gitlabRequestIdentity = ({
  host,
  projectPath,
  mr,
}: IdentityParams): MountPullRequestIdentity => ({
  provider: 'gitlab',
  host: requestHost({ url: mr.webUrl, fallback: host }),
  repoSlug: projectPath,
  prNumber: mr.iid,
});

export const toMountMrLink = ({
  mountId,
  host,
  projectPath,
  mr,
  existing,
  observedAt,
}: LinkParams): MountPullRequestLink =>
  buildMountRequestLink({
    mountId,
    identity: gitlabRequestIdentity({ host, projectPath, mr }),
    headBranch: mr.sourceBranch,
    baseBranch: mr.targetBranch,
    url: mr.webUrl,
    state: gitlabRequestState({ mr }),
    snapshot: mr,
    existing,
    observedAt,
  });

export const mergeRequestFromLink = ({ link }: SnapshotParams): GitlabMergeRequest | null =>
  isMergeRequest(link.snapshot) ? link.snapshot : null;
