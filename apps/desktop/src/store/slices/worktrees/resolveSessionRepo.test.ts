import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  Session,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import { resolveSessionRepo } from './resolveSessionRepo';

const NOW = '2026-01-01T00:00:00.000Z' as IsoDateTime;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const SESSION_ID = 'session-1' as SessionId;
const OVERRIDES: OverrideSettings = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};
const PROJECT: Project = {
  id: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  name: 'api',
  rootPath: '/repo/api',
  kind: 'repo',
  overrides: OVERRIDES,
  createdAt: NOW,
  updatedAt: NOW,
};
const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  activeProjectId: PROJECT_ID,
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

describe('resolveSessionRepo', () => {
  it('resolves the active project mount', () => {
    const result = resolveSessionRepo({
      state: {
        sessions: [SESSION],
        projects: [PROJECT],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'api',
              worktreePath: '/sessions/one/api',
              repoRoot: '/repo/api',
              branch: 'ak/one',
            },
          ],
        },
        sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
      },
      sessionId: SESSION_ID,
    });
    expect(result).toEqual({
      projectId: PROJECT_ID,
      mountName: 'api',
      worktreePath: '/sessions/one/api',
      repoRoot: '/repo/api',
      branch: 'ak/one',
      mountId: null,
      revision: null,
    });
  });

  it('does not expose folder projects as repositories', () => {
    const result = resolveSessionRepo({
      state: {
        sessions: [SESSION],
        projects: [{ ...PROJECT, kind: 'folder' }],
        sessionMounts: {},
        sessionActiveMount: {},
        sessionProjectMounts: {
          [SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'api',
              worktreePath: '/sessions/one/api',
              repoRoot: '/repo/api',
              branch: '',
            },
          ],
        },
        sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
      },
      sessionId: SESSION_ID,
    });
    expect(result).toBeNull();
  });
});
