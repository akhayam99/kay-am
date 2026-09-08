import type {
  MountId,
  ProjectId,
  Session,
  SessionId,
  SessionMountView,
  SessionProjectMount,
} from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { selectActiveMountId, selectWritableMounts } from '../project-mounts/selectors';
import type { AppState } from '../../types';

type State = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
>;

export type MountPrTarget = Readonly<{
  id: MountId;
  projectId: ProjectId;
  branch: string;
  baseBranch: string | null;
  repoRoot: string;
  worktreePath: string | null;
  repoSlug: string | null;
  revision: number;
}>;

export type MountPrFetch = Readonly<{
  session: Session;
  mount: MountPrTarget;
  cwd: string;
}>;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

type SessionParams = {
  readonly state: State;
  readonly sessionId: SessionId;
};

type TargetParams = {
  readonly state: Pick<AppState, 'sessionMounts' | 'sessionProjectMounts'>;
  readonly sessionId: SessionId;
};

type RevisionParams = SessionParams & {
  readonly mountId: MountId;
};

const fromView = (view: SessionMountView): MountPrTarget => ({
  id: view.id,
  projectId: view.projectId,
  branch: view.branch,
  baseBranch: view.baseBranch,
  repoRoot: view.repoRoot,
  worktreePath: view.worktreePath,
  repoSlug: view.repoSlug,
  revision: view.revision,
});

const fromProjectMount = (mount: SessionProjectMount): MountPrTarget | null => {
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
}: TargetParams): ReadonlyArray<MountPrTarget> => {
  const views = state.sessionMounts?.[sessionId];
  if (views !== undefined) {
    return views.map(fromView);
  }
  return selectWritableMounts({ state, sessionId }).flatMap((mount) => {
    const target = fromProjectMount(mount);
    return target === null ? [] : [target];
  });
};

type ToFetchParams = {
  readonly session: Session;
  readonly mount: MountPrTarget;
};

const toFetch = ({ session, mount }: ToFetchParams): MountPrFetch | null => {
  if (isBranchlessSession({ branch: mount.branch })) {
    return null;
  }
  return { session, mount, cwd: mount.worktreePath ?? mount.repoRoot };
};

export const resolveSessionPrFetch = ({
  state,
  sessionId,
  mountId,
}: Params): MountPrFetch | null => {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return null;
  }
  const selectedMountId = mountId ?? selectActiveMountId({ state, sessionId });
  if (selectedMountId === null) {
    return null;
  }
  const mount = sessionMountTargets({ state, sessionId }).find(
    (candidate) => candidate.id === selectedMountId,
  );
  if (mount === undefined) {
    return null;
  }
  return toFetch({ session, mount });
};

export const listSessionPrFetches = ({
  state,
  sessionId,
}: SessionParams): ReadonlyArray<MountPrFetch> => {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return [];
  }
  return sessionMountTargets({ state, sessionId }).flatMap((mount) => {
    const fetch = toFetch({ session, mount });
    return fetch === null ? [] : [fetch];
  });
};

export const mountRevision = ({ state, sessionId, mountId }: RevisionParams): number | null =>
  sessionMountTargets({ state, sessionId }).find((candidate) => candidate.id === mountId)
    ?.revision ?? null;

export const isSessionPrFetchable = (params: Params): boolean =>
  resolveSessionPrFetch(params) !== null;
