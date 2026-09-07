import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  Project,
  ProjectId,
  Workspace,
  WorkspaceId,
  WorkspaceProfile,
} from '@goodboy/types';
import type { AppStore } from '../../store';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({
  validateGitRepo: vi.fn(),
  findProjectByRootPath: vi.fn(),
  getWorkspaceById: vi.fn(),
  insertProject: vi.fn(async () => undefined),
  insertWorkspace: vi.fn(async () => undefined),
  reconnectProject: vi.fn(async () => undefined),
  reconnectWorkspace: vi.fn(async () => undefined),
  disconnectWorkspace: vi.fn(async () => undefined),
  upsertWorkspaceProfile: vi.fn(async () => undefined),
  describeProjectAdoption: vi.fn(async () => null),
  seedWorkflowLibrary: vi.fn(async () => undefined),
  invokeWorkflowList: vi.fn(async () => []),
  invokeSkillRescan: vi.fn(async () => []),
}));

vi.mock('@goodboy/db', () => ({
  findProjectByRootPath: h.findProjectByRootPath,
  getWorkspaceById: h.getWorkspaceById,
  insertProject: h.insertProject,
  insertWorkspace: h.insertWorkspace,
  reconnectProject: h.reconnectProject,
  reconnectWorkspace: h.reconnectWorkspace,
  disconnectWorkspace: h.disconnectWorkspace,
  upsertWorkspaceProfile: h.upsertWorkspaceProfile,
  describeProjectAdoption: h.describeProjectAdoption,
}));

vi.mock('@goodboy/core', () => ({ seedWorkflowLibrary: h.seedWorkflowLibrary }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../shared/lib/repo', () => ({ validateGitRepo: h.validateGitRepo }));
vi.mock('../../../features/workflows/workflows', () => ({
  invokeWorkflowList: h.invokeWorkflowList,
}));
vi.mock('../../../features/skills/skills', () => ({ invokeSkillRescan: h.invokeSkillRescan }));
vi.mock('../../../features/chat/turn', () => ({ cancelTurn: vi.fn(async () => undefined) }));
vi.mock('../../../features/terminal/terminal', () => ({
  invokeTerminalClose: vi.fn(async () => undefined),
}));

import { addWorkspace } from './addWorkspace';
import { deleteWorkspace } from './deleteWorkspace';
import { updateWorkspaceProfile } from './updateWorkspaceProfile';
import { addProject } from '../projects/addProject';
import { addProjects } from '../projects/addProjects';

const NOW = '2026-08-22T00:00:00.000Z' as IsoDateTime;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;

const overrides = {
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
} as const;

const workspace = (): Workspace => ({
  id: WORKSPACE_ID,
  name: 'Demo Team',
  slug: 'demo-team',
  sessionsRoot: '/repos/api',
  overrides,
  createdAt: NOW,
  updatedAt: NOW,
});

const project = (changes: Partial<Project> = {}): Project => ({
  id: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  name: 'api',
  rootPath: '/repos/api',
  kind: 'repo',
  overrides,
  createdAt: NOW,
  updatedAt: NOW,
  ...changes,
});

type Harness = {
  state: AppStore;
  set: SetFn;
  get: GetFn;
};

const harness = (initial: Record<string, unknown>): Harness => {
  let state = {
    workspaces: [],
    projects: [],
    phaseTemplates: {},
    skills: {},
    currentWorkspaceId: null,
    sessions: [],
    terminalSessions: {},
    archivedSessions: {},
    workspaceIntegrations: {},
    projectScripts: {},
    workspaceOverrides: {},
    emitNotification: vi.fn(async () => undefined),
    ...initial,
  } as unknown as AppStore;
  const set: SetFn = (update) => {
    const patch = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...patch };
  };
  return {
    get state() {
      return state;
    },
    set,
    get: () => state,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.findProjectByRootPath.mockResolvedValue(null);
  h.validateGitRepo.mockResolvedValue({
    isRepo: true,
    rootPath: '/repos/api',
    resolvedPath: '/repos/api',
    error: null,
  });
});

describe('workspace and project slices', () => {
  it('creates one container and one leaf project with distinct identifiers', async () => {
    const store = harness({});

    const created = await addWorkspace(store.set, store.get)({ rootPath: '/repos/api' });

    expect(created.name).toBe('api');
    expect(h.insertWorkspace).toHaveBeenCalledOnce();
    expect(h.insertProject).toHaveBeenCalledOnce();
    const insertedWorkspace = store.state.workspaces[0]!;
    const insertedProject = store.state.projects[0]!;
    expect(String(insertedWorkspace.id)).not.toBe(String(insertedProject.id));
    expect(insertedWorkspace.sessionsRoot).toBeNull();
    expect(insertedProject.workspaceId).toBe(insertedWorkspace.id);
    expect(store.state.workspaces).toEqual([insertedWorkspace]);
    expect(store.state.projects).toEqual([insertedProject]);
  });

  it('reconnects a disconnected project into its existing container', async () => {
    const disconnected = project({ disconnectedAt: NOW });
    h.findProjectByRootPath.mockResolvedValueOnce(disconnected);
    const store = harness({ workspaces: [workspace()] });

    const result = await addProject(
      store.set,
      store.get,
    )({
      workspaceId: WORKSPACE_ID,
      rootPath: '/repos/api',
    });

    expect(h.reconnectProject).toHaveBeenCalledOnce();
    expect(h.insertProject).not.toHaveBeenCalled();
    expect(result.kind).toBe('linked');
    if (result.kind !== 'linked') {
      throw new Error('expected linked result');
    }
    expect(result.project.disconnectedAt).toBeUndefined();
    expect(store.state.projects).toEqual([result.project]);
  });

  it('returns a typed conflict when the path already belongs to another workspace', async () => {
    const otherWorkspace: Workspace = {
      ...workspace(),
      id: 'workspace-2' as WorkspaceId,
      name: 'Other Team',
    };
    const owned = project({ workspaceId: otherWorkspace.id });
    h.findProjectByRootPath.mockResolvedValueOnce(owned);
    h.describeProjectAdoption.mockResolvedValueOnce({
      sourceWorkspaceId: otherWorkspace.id,
      isShell: true,
      sessionCount: 4,
    } as never);
    const store = harness({ workspaces: [workspace(), otherWorkspace] });

    const result = await addProject(
      store.set,
      store.get,
    )({
      workspaceId: WORKSPACE_ID,
      rootPath: '/repos/api',
    });

    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') {
      throw new Error('expected conflict result');
    }
    expect(result.conflict.project).toEqual(owned);
    expect(result.conflict.sourceWorkspace).toEqual(otherWorkspace);
    expect(result.conflict.sessionCount).toBe(4);
    expect(result.conflict.isShell).toBe(true);
    expect(h.insertProject).not.toHaveBeenCalled();
    expect(store.state.projects).toEqual([]);
  });

  it('refuses a path already linked to the same workspace with plain copy', async () => {
    h.findProjectByRootPath.mockResolvedValueOnce(project());
    const store = harness({ workspaces: [workspace()] });

    await expect(
      addProject(
        store.set,
        store.get,
      )({
        workspaceId: WORKSPACE_ID,
        rootPath: '/repos/api',
      }),
    ).rejects.toThrow('api is already linked to this workspace');

    expect(h.insertProject).not.toHaveBeenCalled();
  });

  it('refuses a non-repo folder when the caller requires a repository', async () => {
    h.validateGitRepo.mockResolvedValueOnce({
      isRepo: false,
      rootPath: null,
      resolvedPath: '/repos/plain',
      error: 'not a git repository',
    });
    const store = harness({ workspaces: [workspace()] });

    await expect(
      addProject(
        store.set,
        store.get,
      )({
        workspaceId: WORKSPACE_ID,
        rootPath: '/repos/plain',
        requireRepo: true,
      }),
    ).rejects.toThrow(/no git repository/);

    expect(h.insertProject).not.toHaveBeenCalled();
    expect(store.state.projects).toEqual([]);
  });

  it('links every selected child repository through the single-project flow', async () => {
    h.validateGitRepo.mockImplementation(async (path: string) => ({
      isRepo: true,
      rootPath: path,
      resolvedPath: path,
      error: null,
    }));
    const store = harness({ workspaces: [workspace()] });

    const result = await addProjects(
      store.set,
      store.get,
    )({
      workspaceId: WORKSPACE_ID,
      rootPaths: ['/repos/api', '/repos/web'],
    });

    expect(result.linked.map((created) => created.rootPath)).toEqual(['/repos/api', '/repos/web']);
    expect(result.linked.every((created) => created.kind === 'repo')).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(h.insertProject).toHaveBeenCalledTimes(2);
    expect(store.state.projects.length).toBe(2);
  });

  it('refuses a selected child that is not a repository', async () => {
    h.validateGitRepo.mockResolvedValue({
      isRepo: false,
      rootPath: null,
      resolvedPath: '/repos/plain',
      error: 'not a git repository',
    });
    const store = harness({ workspaces: [workspace()] });

    await expect(
      addProjects(
        store.set,
        store.get,
      )({
        workspaceId: WORKSPACE_ID,
        rootPaths: ['/repos/plain'],
      }),
    ).rejects.toThrow(/no git repository/);

    expect(h.insertProject).not.toHaveBeenCalled();
  });

  it('still links a plain folder when a repository is not required', async () => {
    h.validateGitRepo.mockResolvedValueOnce({
      isRepo: false,
      rootPath: null,
      resolvedPath: '/repos/plain',
      error: 'not a git repository',
    });
    const store = harness({ workspaces: [workspace()] });

    const created = await addProject(
      store.set,
      store.get,
    )({
      workspaceId: WORKSPACE_ID,
      rootPath: '/repos/plain',
    });

    expect(created.kind).toBe('linked');
    if (created.kind !== 'linked') {
      throw new Error('expected linked result');
    }
    expect(created.project.kind).toBe('folder');
    expect(h.insertProject).toHaveBeenCalledOnce();
  });

  it('persists a container profile and updates the cached workspace', async () => {
    const store = harness({ workspaces: [workspace()] });
    const profile: WorkspaceProfile = {
      bio: 'I keep the platform reliable.',
    };

    const result = await updateWorkspaceProfile(
      store.set,
      store.get,
    )({
      workspaceId: WORKSPACE_ID,
      profile,
    });

    expect(h.upsertWorkspaceProfile).toHaveBeenCalledWith({
      db: expect.anything(),
      workspaceId: WORKSPACE_ID,
      profile,
    });
    expect(result.profile).toEqual(profile);
    expect(store.state.workspaces[0]?.profile).toEqual(profile);
  });

  it('disconnects a container and removes its cached projects', async () => {
    const store = harness({
      workspaces: [workspace()],
      projects: [project()],
      workspaceIntegrations: { [WORKSPACE_ID]: [] },
      projectScripts: { [WORKSPACE_ID]: [] },
      workspaceOverrides: { [WORKSPACE_ID]: overrides },
    });

    await deleteWorkspace(store.set, store.get)(WORKSPACE_ID);

    expect(h.disconnectWorkspace).toHaveBeenCalledOnce();
    expect(store.state.workspaces).toEqual([]);
    expect(store.state.projects).toEqual([]);
    expect(store.state.workspaceIntegrations[WORKSPACE_ID]).toBeUndefined();
  });
});
