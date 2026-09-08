import type { MountId, SessionId } from '@goodboy/types';
import {
  listMountFetches,
  resolveMountFetch,
  type MountFetch,
} from '../project-mounts/mountRequests';
import type { AppState } from '../../types';

type State = Pick<
  AppState,
  | 'sessions'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
>;

export type MountPrFetch = MountFetch;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

type SessionParams = {
  readonly state: State;
  readonly sessionId: SessionId;
};

export const resolveSessionPrFetch = (params: Params): MountPrFetch | null =>
  resolveMountFetch(params);

export const listSessionPrFetches = (params: SessionParams): ReadonlyArray<MountPrFetch> =>
  listMountFetches(params);

export const isSessionPrFetchable = (params: Params): boolean => resolveMountFetch(params) !== null;
