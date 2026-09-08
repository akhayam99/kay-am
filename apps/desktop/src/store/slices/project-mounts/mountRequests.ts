import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  MountPullRequestState,
  ProjectId,
  Session,
  SessionEventKind,
  SessionEventPayload,
  SessionId,
  SessionMountView,
  SessionProjectMount,
} from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import type { AppState } from '../../types';
import type { GetFn } from '../../slice-types';
import { selectActiveMountId, selectWritableMounts } from './selectors';

export type MountTarget = Readonly<{
  id: MountId;
  projectId: ProjectId;
  branch: string;
  baseBranch: string | null;
  repoRoot: string;
  worktreePath: string | null;
  repoSlug: string | null;
  revision: number;
}>;

type TargetParams = {
  readonly state: Pick<AppState, 'sessionMounts' | 'sessionProjectMounts'>;
  readonly sessionId: SessionId;
};

type RevisionParams = TargetParams & {
  readonly mountId: MountId;
};

type FetchState = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
>;

type FetchParams = {
  readonly state: FetchState;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

type IdentityParams = {
  readonly identity: MountPullRequestIdentity;
  readonly candidate: MountPullRequestIdentity;
};

type HostParams = {
  readonly url: string;
  readonly fallback: string;
};

type LinkParams = {
  readonly mountId: MountId;
  readonly identity: MountPullRequestIdentity;
  readonly headBranch: string;
  readonly baseBranch: string | null;
  readonly url: string;
  readonly state: MountPullRequestState;
  readonly snapshot: unknown;
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

type TransitionParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly previous: MountPullRequestLink | null;
  readonly next: MountPullRequestLink;
  readonly title: string;
  readonly url: string;
};

const OBSERVED_KIND: Partial<Record<MountPullRequestState, SessionEventKind>> = {
  approved: 'pr_approved',
  merged: 'pr_merged',
  closed: 'pr_closed',
};

const fromView = (view: SessionMountView): MountTarget => ({
  id: view.id,
  projectId: view.projectId,
  branch: view.branch,
  baseBranch: view.baseBranch,
  repoRoot: view.repoRoot,
  worktreePath: view.worktreePath,
  repoSlug: view.repoSlug,
  revision: view.revision,
});

const fromProjectMount = (mount: SessionProjectMount): MountTarget | null => {
  const id = mount.mountId;
  if (id === undefined) {
    return null;
  }
  return {
    id,
    projectId: mount.projectId,
    branch: mount.branch,
    baseBranch: mount.baseBranch ?? null,
    repoRoot: mount.repoRoot,
    worktreePath: mount.worktreePath,
    repoSlug: null,
    revision: mount.revision ?? 0,
  };
};

export const sessionMountTargets = ({
  state,
  sessionId,
}: TargetParams): ReadonlyArray<MountTarget> => {
  const views = state.sessionMounts?.[sessionId];
  if (views !== undefined) {
    return views.map(fromView);
  }
  return selectWritableMounts({ state, sessionId }).flatMap((mount) => {
    const target = fromProjectMount(mount);
    return target === null ? [] : [target];
  });
};

export const mountRevision = ({ state, sessionId, mountId }: RevisionParams): number | null =>
  sessionMountTargets({ state, sessionId }).find((candidate) => candidate.id === mountId)
    ?.revision ?? null;

export type MountFetch = Readonly<{
  session: Session;
  mount: MountTarget;
  cwd: string;
}>;

type ToFetchParams = {
  readonly session: Session;
  readonly mount: MountTarget;
};

const toFetch = ({ session, mount }: ToFetchParams): MountFetch | null => {
  if (isBranchlessSession({ branch: mount.branch })) {
    return null;
  }
  return { session, mount, cwd: mount.worktreePath ?? mount.repoRoot };
};

export const listMountFetches = ({ state, sessionId }: FetchParams): ReadonlyArray<MountFetch> => {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return [];
  }
  return sessionMountTargets({ state, sessionId }).flatMap((mount) => {
    const fetch = toFetch({ session, mount });
    return fetch === null ? [] : [fetch];
  });
};

export const resolveMountFetch = ({
  state,
  sessionId,
  mountId,
}: FetchParams): MountFetch | null => {
  const selectedMountId = mountId ?? selectActiveMountId({ state, sessionId });
  if (selectedMountId === null) {
    return null;
  }
  return (
    listMountFetches({ state, sessionId }).find((fetch) => fetch.mount.id === selectedMountId) ??
    null
  );
};

export const requestIdentityEquals = ({ identity, candidate }: IdentityParams): boolean =>
  identity.provider === candidate.provider &&
  identity.host === candidate.host &&
  identity.repoSlug === candidate.repoSlug &&
  identity.prNumber === candidate.prNumber;

export const requestHost = ({ url, fallback }: HostParams): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return fallback;
  }
};

export const buildMountRequestLink = ({
  mountId,
  identity,
  headBranch,
  baseBranch,
  url,
  state,
  snapshot,
  existing,
  observedAt,
}: LinkParams): MountPullRequestLink => ({
  id: existing?.id ?? crypto.randomUUID(),
  mountId,
  ...identity,
  headBranch,
  baseBranch,
  url,
  state,
  snapshot,
  lastObservedAt: observedAt,
  createdAt: existing?.createdAt ?? observedAt,
  updatedAt: observedAt,
});

export const mountRequestEventPayload = ({
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

export const observeMountRequestTransition = async ({
  get,
  sessionId,
  projectId,
  previous,
  next,
  title,
  url,
}: TransitionParams): Promise<void> => {
  const payload = mountRequestEventPayload({
    mountId: next.mountId,
    projectId,
    identity: next,
    title,
    url,
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
  if (next.state !== 'merged') {
    return;
  }
  await get()
    .proposeMountCleanup({
      sessionId,
      mountId: next.mountId,
      reason: 'merge_cleanup',
      expectedBranch: next.headBranch,
      request: {
        provider: next.provider,
        host: next.host,
        repoSlug: next.repoSlug,
        prNumber: next.prNumber,
      },
    })
    .catch(() => undefined);
};
