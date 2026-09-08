import type { MountBranchObservation, MountId, SessionMountView } from '@goodboy/types';

export type ProjectMountsState = {
  readonly sessionMounts: Readonly<Record<string, ReadonlyArray<SessionMountView>>>;
  readonly mountBranchObservations: Readonly<Record<string, ReadonlyArray<MountBranchObservation>>>;
  readonly sessionActiveMount: Readonly<Record<string, MountId | null>>;
};

export const projectMountsInitialState: ProjectMountsState = {
  sessionMounts: {},
  mountBranchObservations: {},
  sessionActiveMount: {},
};
