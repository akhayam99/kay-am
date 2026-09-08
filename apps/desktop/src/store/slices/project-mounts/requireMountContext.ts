import type { Project, ProjectId, Session, SessionId } from '@goodboy/types';
import { mountError } from './mountErrors';
import type { GetFn } from './types';

type SessionParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
};

type ContextParams = SessionParams & {
  readonly projectId: ProjectId;
};

export type MountContext = {
  readonly session: Session;
  readonly project: Project;
};

export const requireSession = ({ get, sessionId }: SessionParams): Session => {
  const session =
    get().sessions.find((candidate) => candidate.id === sessionId) ??
    Object.values(get().archivedSessions)
      .flat()
      .find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    throw mountError({ code: 'mount-missing', message: `session not found: ${sessionId}` });
  }
  return session;
};

export const requireMountContext = ({ get, sessionId, projectId }: ContextParams): MountContext => {
  const session = requireSession({ get, sessionId });
  const project = get().projects.find((candidate) => candidate.id === projectId);
  if (project === undefined || project.workspaceId !== session.workspaceId) {
    throw mountError({
      code: 'project-missing',
      message: `project not found in this workspace: ${projectId}`,
    });
  }
  return { session, project };
};
