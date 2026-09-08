import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  ProjectId,
  Session,
  SessionId,
  SessionProjectMount,
  WorkspaceId,
} from '@goodboy/types';
import { resolveProjectMountPath } from './resolveProjectMountPath';

const NOW = '2026-01-01T00:00:00.000Z' as IsoDateTime;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const API_ID = 'project-api' as ProjectId;
const WEB_ID = 'project-web' as ProjectId;
const SESSION_ID = 'session-1' as SessionId;

const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  activeProjectId: API_ID,
  goal: 'test',
  state: { kind: 'draft' },
  contextSlots: [],
  providerPreference: {
    defaultProvider: 'anthropic',
    enabledProviders: ['anthropic'],
    allowTurnOverride: true,
  },
  permissionMode: 'bypassPermissions',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const MOUNTS: ReadonlyArray<SessionProjectMount> = [
  {
    projectId: WEB_ID,
    mountName: 'web',
    worktreePath: '/sessions/one/web',
    repoRoot: '/repo/web',
    branch: 'ak/one',
  },
  {
    projectId: API_ID,
    mountName: 'api',
    worktreePath: '/sessions/one/api',
    repoRoot: '/repo/api',
    branch: 'ak/one',
  },
];

describe('resolveProjectMountPath', () => {
  it('returns the requested project mount instead of the active mount', () => {
    const path = resolveProjectMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionActiveProject: {},
        sessionProjectMounts: { [SESSION_ID]: MOUNTS },
      },
      sessionId: SESSION_ID,
      projectId: WEB_ID,
    });

    expect(path).toBe('/sessions/one/web');
  });

  it('returns null when the requested project is not mounted', () => {
    const path = resolveProjectMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionActiveProject: {},
        sessionProjectMounts: { [SESSION_ID]: [MOUNTS[0]!] },
      },
      sessionId: SESSION_ID,
      projectId: API_ID,
    });

    expect(path).toBeNull();
  });

  it('returns null when the session does not exist', () => {
    const path = resolveProjectMountPath({
      state: {
        sessions: [],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionActiveProject: {},
        sessionProjectMounts: { [SESSION_ID]: MOUNTS },
      },
      sessionId: SESSION_ID,
      projectId: WEB_ID,
    });

    expect(path).toBeNull();
  });
});
