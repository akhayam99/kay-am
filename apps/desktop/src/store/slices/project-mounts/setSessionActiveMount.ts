import { updateSessionActiveMount, updateSessionActiveProject } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { mountError } from './mountErrors';
import { selectWritableMounts } from './selectors';
import type { GetFn, MountKeyInput, SetFn } from './types';

export const setSessionActiveMount = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId }: MountKeyInput): Promise<void> => {
    const mount = selectWritableMounts({ state: get(), sessionId }).find(
      (candidate) => candidate.mountId === mountId,
    );
    if (mount === undefined) {
      throw mountError({
        code: 'mount-missing',
        message: `mount is not available in this session: ${mountId}`,
        mountId,
      });
    }
    const projectId = mount.projectId;
    set((state) => {
      const nextGithub = { ...state.sessionGithub };
      const nextGitlab = { ...state.sessionGitlabMr };
      const nextSelectedPrNumber = { ...state.sessionSelectedPrNumber };
      delete nextGithub[sessionId];
      delete nextGitlab[sessionId];
      delete nextSelectedPrNumber[sessionId];
      const cachedPr = state.sessionProjectPrs[sessionId]?.[projectId]?.[0] ?? null;
      const seededGithub =
        cachedPr === null
          ? nextGithub
          : {
              ...nextGithub,
              [sessionId]: {
                pr: cachedPr,
                linkedIssues: [],
                fetchedAt: null,
                failedAt: null,
                loading: false,
                error: null,
                detail: null,
                detailFetchedAt: null,
                detailLoading: false,
                detailError: null,
              },
            };
      return {
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, activeProjectId: projectId, activeMountId: mountId }
            : session,
        ),
        sessionActiveMount: { ...state.sessionActiveMount, [sessionId]: mountId },
        sessionActiveProject: { ...state.sessionActiveProject, [sessionId]: projectId },
        sessionBranches: { ...state.sessionBranches, [sessionId]: mount.branch },
        sessionGithub: seededGithub,
        sessionGitlabMr: nextGitlab,
        sessionSelectedPrNumber: nextSelectedPrNumber,
      };
    });
    if (get().githubStatus?.available === true) {
      void get()
        .refreshSessionPr(sessionId, { force: true, silent: true, retries: 1 })
        .then(() => get().refreshSessionPrDetail(sessionId, { silent: true }));
    }
    await updateSessionActiveProject({ db: tauriDatabase, id: sessionId, projectId });
    await updateSessionActiveMount({ db: tauriDatabase, sessionId, mountId });
  };
};
