import type {
  MountBranchObservation,
  MountId,
  ProjectId,
  SessionId,
  SessionMountView,
  SessionProjectMount,
} from '@goodboy/types';
import type { AppState } from '../../types';
import { pickActiveMount } from './activeMount';
import { toProjectMounts } from './mountViews';

type MountState = Pick<AppState, 'sessionMounts' | 'sessionProjectMounts'>;

type ObservationState = Pick<AppState, 'mountBranchObservations'>;

type ActiveState = MountState &
  Pick<AppState, 'sessions' | 'sessionActiveMount' | 'sessionActiveProject'>;

type SessionParams = {
  readonly state: MountState;
  readonly sessionId: SessionId;
};

type ActiveParams = {
  readonly state: ActiveState;
  readonly sessionId: SessionId;
};

type ProjectParams = {
  readonly state: ActiveState;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
};

type MountParams = {
  readonly state: MountState & ObservationState;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

type ObservationParams = {
  readonly state: ObservationState;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

const isOnDisk = (view: SessionMountView): boolean =>
  view.diskState !== 'missing' && view.diskState !== 'removed';

export const selectWritableMounts = ({
  state,
  sessionId,
}: SessionParams): ReadonlyArray<SessionProjectMount> => {
  const views = state.sessionMounts?.[sessionId];
  if (views === undefined) {
    return state.sessionProjectMounts?.[sessionId] ?? [];
  }
  return toProjectMounts(views.filter(isOnDisk));
};

export const selectMountBranchObservation = ({
  state,
  sessionId,
  mountId,
}: ObservationParams): MountBranchObservation | null =>
  (state.mountBranchObservations?.[sessionId] ?? []).find(
    (candidate) => candidate.mountId === mountId,
  ) ?? null;

export const isMountBranchBlocked = ({ state, sessionId, mountId }: ObservationParams): boolean => {
  const observation = selectMountBranchObservation({ state, sessionId, mountId });
  return observation !== null && observation.state !== 'matched';
};

export const selectMountById = ({
  state,
  sessionId,
  mountId,
}: MountParams): SessionProjectMount | null =>
  selectWritableMounts({ state, sessionId }).find((candidate) => candidate.mountId === mountId) ??
  null;

export const selectWritableMountPath = ({
  state,
  sessionId,
  mountId,
}: MountParams): string | null => {
  if (isMountBranchBlocked({ state, sessionId, mountId })) {
    return null;
  }
  return selectMountById({ state, sessionId, mountId })?.worktreePath ?? null;
};

type ActiveFromParams = ActiveParams & {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
};

const activeMountOf = ({
  state,
  sessionId,
  mounts,
}: ActiveFromParams): SessionProjectMount | null => {
  const session = state.sessions?.find((candidate) => candidate.id === sessionId);
  return pickActiveMount({
    mounts,
    selectedMountId: state.sessionActiveMount?.[sessionId],
    storedMountId: session?.activeMountId,
    activeProjectId: state.sessionActiveProject?.[sessionId] ?? session?.activeProjectId,
  });
};

export const selectActiveMount = ({ state, sessionId }: ActiveParams): SessionProjectMount | null =>
  activeMountOf({ state, sessionId, mounts: selectWritableMounts({ state, sessionId }) });

export const selectActiveMountId = ({ state, sessionId }: ActiveParams): MountId | null =>
  selectActiveMount({ state, sessionId })?.mountId ?? null;

export const selectActiveProjectId = ({ state, sessionId }: ActiveParams): ProjectId | null =>
  selectActiveMount({ state, sessionId })?.projectId ?? null;

export const selectProjectMounts = ({
  state,
  sessionId,
  projectId,
}: ProjectParams): ReadonlyArray<SessionProjectMount> =>
  selectWritableMounts({ state, sessionId }).filter((mount) => mount.projectId === projectId);

export const selectUnambiguousProjectMount = ({
  state,
  sessionId,
  projectId,
}: ProjectParams): SessionProjectMount | null => {
  const mounts = selectWritableMounts({ state, sessionId });
  const candidates = mounts.filter((mount) => mount.projectId === projectId);
  const only = candidates[0];
  if (only === undefined) {
    return null;
  }
  if (candidates.length === 1) {
    return only;
  }
  const session = state.sessions?.find((candidate) => candidate.id === sessionId);
  const explicitId = state.sessionActiveMount?.[sessionId] ?? session?.activeMountId ?? null;
  if (explicitId === null) {
    return null;
  }
  return candidates.find((mount) => mount.mountId === explicitId) ?? null;
};

type PathParams = {
  readonly state: MountState;
  readonly sessionId: SessionId;
  readonly path: string | null;
};

export const selectMountForPath = ({
  state,
  sessionId,
  path,
}: PathParams): SessionProjectMount | null => {
  if (path === null || path === '') {
    return null;
  }
  return (
    selectWritableMounts({ state, sessionId }).find((mount) => mount.worktreePath === path) ?? null
  );
};
