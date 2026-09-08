import type { MountId, SessionId } from '@goodboy/types';
import type { AppState } from '../../types';

type State = Pick<AppState, 'sessions' | 'sessionProjectMounts' | 'sessionActiveProject'>;

type Params = {
  readonly state: State;
  readonly sessionId: SessionId;
};

export const resolveActiveMountId = ({ state, sessionId }: Params): MountId | null => {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  const activeMountId = session?.activeMountId;
  const mounts = state.sessionProjectMounts[sessionId] ?? [];
  if (activeMountId !== undefined && mounts.some((mount) => mount.mountId === activeMountId)) {
    return activeMountId;
  }
  const activeProjectId = state.sessionActiveProject[sessionId] ?? session?.activeProjectId;
  const active = mounts.find((mount) => mount.projectId === activeProjectId) ?? mounts[0];
  return active?.mountId ?? null;
};
