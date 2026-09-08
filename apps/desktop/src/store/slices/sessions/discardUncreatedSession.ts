import type { SessionId } from '@goodboy/types';
import { deleteSession } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { forgetMaterializationSeed } from './materializationSeeds';
import type { SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
};

export const discardUncreatedSession = async ({ set, sessionId }: Params): Promise<void> => {
  forgetMaterializationSeed({ sessionId });
  await deleteSession(tauriDatabase, sessionId).catch(() => undefined);
  set((state) => {
    const sessionWorktrees = { ...state.sessionWorktrees };
    delete sessionWorktrees[sessionId];
    const sessionProjectMounts = { ...state.sessionProjectMounts };
    delete sessionProjectMounts[sessionId];
    const sessionBranches = { ...state.sessionBranches };
    delete sessionBranches[sessionId];
    const sessionActiveProject = { ...state.sessionActiveProject };
    delete sessionActiveProject[sessionId];
    const sessionActiveMount = { ...state.sessionActiveMount };
    delete sessionActiveMount[sessionId];
    const sessionMounts = { ...state.sessionMounts };
    delete sessionMounts[sessionId];
    return {
      sessions: state.sessions.filter((candidate) => candidate.id !== sessionId),
      currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
      sessionWorktrees,
      sessionProjectMounts,
      sessionBranches,
      sessionActiveProject,
      sessionActiveMount,
      sessionMounts,
    };
  });
};
