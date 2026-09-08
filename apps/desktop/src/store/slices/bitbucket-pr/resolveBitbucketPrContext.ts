import type { BitbucketIntegrationBinding, MountId, SessionId } from '@goodboy/types';
import type { BitbucketRepo } from '../../../features/integrations/bitbucket/client';
import { worktreeRemoteUrl } from '../../../features/worktree/worktree';
import { projectPathFromRemoteUrl } from '../../../shared/lib/remoteHost';
import {
  listMountFetches,
  resolveMountFetch,
  type MountFetch,
} from '../project-mounts/mountRequests';
import { bitbucketRepoSlug } from './bitbucketRepoSlug';
import type { GetFn } from './types';

export type BitbucketPrContext = {
  readonly target: MountFetch;
  readonly repo: BitbucketRepo;
  readonly branch: string;
  readonly goal: string;
};

type ContextParams = {
  readonly get: GetFn;
  readonly target: MountFetch;
};

type TargetParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

export const resolveBitbucketPrContext = async ({
  get,
  target,
}: ContextParams): Promise<BitbucketPrContext | null> => {
  const session = target.session;
  const integration = (get().workspaceIntegrations[session.workspaceId] ?? []).find(
    (candidate): candidate is BitbucketIntegrationBinding => candidate.provider === 'bitbucket',
  );
  if (integration == null) {
    return null;
  }
  const remoteUrl = await worktreeRemoteUrl(target.mount.repoRoot);
  const repoSlug = bitbucketRepoSlug({ projectPath: projectPathFromRemoteUrl(remoteUrl) });
  if (repoSlug == null) {
    return null;
  }
  return {
    target,
    repo: {
      workspaceId: session.workspaceId,
      workspaceSlug: integration.config.workspaceSlug,
      repoSlug,
      email: integration.config.email,
    },
    branch: target.mount.branch,
    goal: session.goal,
  };
};

export const listSessionBitbucketTargets = ({
  get,
  sessionId,
}: TargetParams): ReadonlyArray<MountFetch> => listMountFetches({ state: get(), sessionId });

export const resolveSessionBitbucketTarget = ({
  get,
  sessionId,
  mountId,
}: TargetParams): MountFetch | null =>
  resolveMountFetch({
    state: get(),
    sessionId,
    ...(mountId === undefined ? {} : { mountId }),
  });
