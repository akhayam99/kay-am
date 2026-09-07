import type { SessionId } from '@goodboy/types';
import { isAttributionEnabled } from '../shared/utils/attribution';
import type { GetFn } from './slice-types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
};

export const isSessionAttributionEnabled = ({ get, sessionId }: Params): boolean => {
  const session = get().sessions.find((candidate) => candidate.id === sessionId);
  if (session == null) {
    return isAttributionEnabled({ overrides: null });
  }
  return isAttributionEnabled({ overrides: get().workspaceOverrides[session.workspaceId] });
};
