import type { GitlabIntegrationBinding, MountId, SessionId, WorkspaceId } from '@goodboy/types';
import { worktreeRemoteUrl } from '../../../features/worktree/worktree';
import { projectPathFromRemoteUrl } from '../../../shared/lib/remoteHost';
import {
  listMountFetches,
  resolveMountFetch,
  type MountFetch,
} from '../project-mounts/mountRequests';
import type { GetFn } from './types';

export type MrContext = {
  readonly target: MountFetch;
  readonly workspaceId: WorkspaceId;
  readonly host: string;
  readonly projectPath: string;
  readonly goal: string;
};

type ContextParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly target: MountFetch;
};

type TargetParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

const gitlabIntegration = ({
  get,
  workspaceId,
}: {
  readonly get: GetFn;
  readonly workspaceId: WorkspaceId;
}): GitlabIntegrationBinding | null =>
  (get().workspaceIntegrations[workspaceId] ?? []).find(
    (candidate): candidate is GitlabIntegrationBinding => candidate.provider === 'gitlab',
  ) ?? null;

export const resolveMrContext = async ({
  get,
  target,
}: ContextParams): Promise<MrContext | null> => {
  const session = target.session;
  const integration = gitlabIntegration({ get, workspaceId: session.workspaceId });
  if (integration === null) {
    return null;
  }
  const remoteUrl = await worktreeRemoteUrl(target.mount.repoRoot);
  const projectPath = projectPathFromRemoteUrl(remoteUrl);
  if (projectPath === null) {
    return null;
  }
  return {
    target,
    workspaceId: session.workspaceId,
    host: integration.config.host,
    projectPath,
    goal: session.goal,
  };
};

export const listSessionMrTargets = ({ get, sessionId }: TargetParams): ReadonlyArray<MountFetch> =>
  listMountFetches({ state: get(), sessionId });

export const resolveSessionMrTarget = ({
  get,
  sessionId,
  mountId,
}: TargetParams): MountFetch | null =>
  resolveMountFetch({
    state: get(),
    sessionId,
    ...(mountId === undefined ? {} : { mountId }),
  });
