import type {
  IsoDateTime,
  MountBranchObservation,
  MountBranchObservationState,
  MountId,
  SessionId,
} from '@goodboy/types';
import type { SetFn } from './types';

type ObservationInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly recordedBranch: string;
  readonly revision: number;
  readonly worktreePath: string | null;
  readonly observedBranch: string | null;
};

type RecordParams = ObservationInput & {
  readonly set: SetFn;
};

type ClearParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

const observationState = ({
  recordedBranch,
  worktreePath,
  observedBranch,
}: Pick<
  ObservationInput,
  'recordedBranch' | 'worktreePath' | 'observedBranch'
>): MountBranchObservationState => {
  if (worktreePath === null) {
    return 'unavailable';
  }
  if (observedBranch === null) {
    return 'detached';
  }
  if (observedBranch === recordedBranch) {
    return 'matched';
  }
  return 'mismatch';
};

const buildMountBranchObservation = ({
  sessionId,
  mountId,
  recordedBranch,
  revision,
  worktreePath,
  observedBranch,
}: ObservationInput): MountBranchObservation => ({
  mountId,
  sessionId,
  state: observationState({ recordedBranch, worktreePath, observedBranch }),
  recordedBranch,
  observedBranch,
  revision,
  observedAt: new Date().toISOString() as IsoDateTime,
});

export const recordMountBranchObservation = ({
  set,
  ...input
}: RecordParams): MountBranchObservation => {
  const observation = buildMountBranchObservation(input);
  set((state) => ({
    mountBranchObservations: {
      ...state.mountBranchObservations,
      [input.sessionId]: [
        ...(state.mountBranchObservations[input.sessionId] ?? []).filter(
          (candidate) => candidate.mountId !== input.mountId,
        ),
        ...(observation.state === 'matched' ? [] : [observation]),
      ],
    },
  }));
  return observation;
};

export const clearMountBranchObservation = ({ set, sessionId, mountId }: ClearParams): void => {
  set((state) => ({
    mountBranchObservations: {
      ...state.mountBranchObservations,
      [sessionId]: (state.mountBranchObservations[sessionId] ?? []).filter(
        (candidate) => candidate.mountId !== mountId,
      ),
    },
  }));
};
