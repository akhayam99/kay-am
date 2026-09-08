import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  ProjectId,
  Session,
  SessionId,
  SessionProjectMount,
  WorkspaceId,
} from '@goodboy/types';
import { resolveActiveMountPath } from './resolveActiveMountPath';

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

describe('resolveActiveMountPath', () => {
  it('follows the active project rather than the first mount', () => {
    const path = resolveActiveMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: MOUNTS },
        sessionActiveProject: { [SESSION_ID]: API_ID },
      },
      sessionId: SESSION_ID,
    });

    expect(path).toBe('/sessions/one/api');
  });

  it('falls back to the session row when the store has no active project yet', () => {
    const path = resolveActiveMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: MOUNTS },
        sessionActiveProject: {},
      },
      sessionId: SESSION_ID,
    });

    expect(path).toBe('/sessions/one/api');
  });

  it('falls back to the first mount when no project is active', () => {
    const path = resolveActiveMountPath({
      state: {
        sessions: [{ ...SESSION, activeProjectId: undefined }],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: MOUNTS },
        sessionActiveProject: {},
      },
      sessionId: SESSION_ID,
    });

    expect(path).toBe('/sessions/one/web');
  });

  it('keeps the first mount when the active project is no longer mounted', () => {
    const path = resolveActiveMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: { [SESSION_ID]: [MOUNTS[0] as SessionProjectMount] },
        sessionActiveProject: { [SESSION_ID]: API_ID },
      },
      sessionId: SESSION_ID,
    });

    expect(path).toBe('/sessions/one/web');
  });

  it('has no path for a session without mounts', () => {
    const path = resolveActiveMountPath({
      state: {
        sessions: [SESSION],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: {},
        sessionActiveProject: {},
      },
      sessionId: SESSION_ID,
    });

    expect(path).toBeNull();
  });
});
