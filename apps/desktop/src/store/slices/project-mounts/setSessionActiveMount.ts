import { updateSessionActiveMount, updateSessionActiveProject } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { deriveBitbucketProjection } from '../bitbucket-pr/mountBitbucketPr';
import { deriveGithubProjection } from '../github/mountGithub';
import { deriveGitlabProjection } from '../gitlab-mr/mountGitlabMr';
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
      const next = {
        ...state,
        sessionActiveMount: { ...state.sessionActiveMount, [sessionId]: mountId },
        sessionActiveProject: { ...state.sessionActiveProject, [sessionId]: projectId },
      };
      return {
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, activeProjectId: projectId, activeMountId: mountId }
            : session,
        ),
        sessionActiveMount: next.sessionActiveMount,
        sessionActiveProject: next.sessionActiveProject,
        sessionBranches: { ...state.sessionBranches, [sessionId]: mount.branch },
        ...deriveGithubProjection({ state: next, sessionId }),
        ...deriveGitlabProjection({ state: next, sessionId }),
        ...deriveBitbucketProjection({ state: next, sessionId }),
      };
    });
    if (get().githubStatus?.available === true) {
      void get()
        .refreshSessionPr(sessionId, { force: true, silent: true, retries: 1, mountId })
        .then(() => get().refreshSessionPrDetail(sessionId, { silent: true, mountId }));
    }
    await updateSessionActiveProject({ db: tauriDatabase, id: sessionId, projectId });
    await updateSessionActiveMount({ db: tauriDatabase, sessionId, mountId });
  };
};
