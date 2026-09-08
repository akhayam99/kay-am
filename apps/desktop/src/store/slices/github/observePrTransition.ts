import type {
  MountPullRequestLink,
  ProjectId,
  PullRequestState,
  PullRequestStateKind,
  SessionEventKind,
  SessionId,
} from '@goodboy/types';
import { mountPrEventPayload } from './mountPrLink';
import type { GetFn } from './types';

const OBSERVED_KIND: Partial<Record<PullRequestStateKind, SessionEventKind>> = {
  approved: 'pr_approved',
  merged: 'pr_merged',
  closed: 'pr_closed',
};

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly previous: MountPullRequestLink | null;
  readonly next: MountPullRequestLink;
  readonly pr: PullRequestState;
};

export const observePrTransition = async ({
  get,
  sessionId,
  projectId,
  previous,
  next,
  pr,
}: Params): Promise<void> => {
  const payload = mountPrEventPayload({
    mountId: next.mountId,
    projectId,
    identity: next,
    title: pr.title,
    url: pr.url,
    branch: next.headBranch,
  });
  if (previous === null) {
    await get().recordSessionEventOnce({ sessionId, kind: 'pr_discovered', payload });
    return;
  }
  if (previous.state === next.state) {
    return;
  }
  const kind = OBSERVED_KIND[next.state];
  if (kind === undefined) {
    return;
  }
  await get().recordSessionEventOnce({ sessionId, kind, payload });
};
