import type { MountId, SessionId } from '@goodboy/types';
import { resolveSessionRepo, type SessionRepo } from './resolveSessionRepo';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

export const getSessionRepo = ({ get, sessionId, mountId }: Params): SessionRepo | null => {
  return resolveSessionRepo({
    state: get(),
    sessionId,
    ...(mountId === undefined ? {} : { mountId }),
  });
};
