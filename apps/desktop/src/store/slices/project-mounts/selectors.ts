import type {
  MountBranchObservation,
  MountId,
  SessionId,
  SessionMountView,
  SessionProjectMount,
} from '@goodboy/types';
import type { AppState } from '../../types';
import { toProjectMounts } from './mountViews';

type MountState = Pick<AppState, 'sessionMounts' | 'sessionProjectMounts'>;

type ObservationState = Pick<AppState, 'mountBranchObservations'>;

type SessionParams = {
  readonly state: MountState;
  readonly sessionId: SessionId;
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
  const views = state.sessionMounts[sessionId];
  if (views === undefined) {
    return state.sessionProjectMounts[sessionId] ?? [];
  }
  return toProjectMounts(views.filter(isOnDisk));
};

export const selectMountBranchObservation = ({
  state,
  sessionId,
  mountId,
}: ObservationParams): MountBranchObservation | null =>
  (state.mountBranchObservations[sessionId] ?? []).find(
    (candidate) => candidate.mountId === mountId,
  ) ?? null;

export const isMountBranchBlocked = ({ state, sessionId, mountId }: ObservationParams): boolean => {
  const observation = selectMountBranchObservation({ state, sessionId, mountId });
  return observation !== null && observation.state !== 'matched';
};

export const selectWritableMountPath = ({
  state,
  sessionId,
  mountId,
}: MountParams): string | null => {
  if (isMountBranchBlocked({ state, sessionId, mountId })) {
    return null;
  }
  const mount = selectWritableMounts({ state, sessionId }).find(
    (candidate) => candidate.mountId === mountId,
  );
  return mount?.worktreePath ?? null;
};
