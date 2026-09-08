import type { MountBranchObservation, SessionMountView } from '@goodboy/types';

export type ProjectMountsState = {
  readonly sessionMounts: Readonly<Record<string, ReadonlyArray<SessionMountView>>>;
  readonly mountBranchObservations: Readonly<Record<string, ReadonlyArray<MountBranchObservation>>>;
};

export const projectMountsInitialState: ProjectMountsState = {
  sessionMounts: {},
  mountBranchObservations: {},
};
