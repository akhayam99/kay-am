import type { MountId, SessionId } from '@goodboy/types';
import { selectActiveMount, selectMountById } from '../project-mounts/selectors';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId | null;
};

export const resolveWorktreeMount = ({ get, sessionId, mountId }: Params): string | null => {
  const state = get();
  if (mountId != null) {
    return selectMountById({ state, sessionId, mountId })?.worktreePath ?? null;
  }
  return selectActiveMount({ state, sessionId })?.worktreePath ?? null;
};
