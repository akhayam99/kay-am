import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoDateTime, Project, ProjectId, Workspace, WorkspaceId } from '@goodboy/types';
import type { AppStore } from '../../store';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({
  describeProjectAdoption: vi.fn(),
  moveProjectToWorkspace: vi.fn(),
  getProjectById: vi.fn(async () => null),
  reconnectProject: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/db', () => ({
  describeProjectAdoption: h.describeProjectAdoption,
  moveProjectToWorkspace: h.moveProjectToWorkspace,
  getProjectById: h.getProjectById,
  reconnectProject: h.reconnectProject,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import { adoptProject } from './adoptProject';

const NOW = '2026-08-22T00:00:00.000Z' as IsoDateTime;
const TARGET = 'ws-target' as WorkspaceId;
const SOURCE = 'ws-source' as WorkspaceId;
const PROJECT_ID = 'proj-1' as ProjectId;

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

const workspace = (id: WorkspaceId, name: string): Workspace => ({
  id,
  name,
  slug: name,
  sessionsRoot: null,
  overrides,
  createdAt: NOW,
  updatedAt: NOW,
});

const project = (changes: Partial<Project> = {}): Project => ({
  id: PROJECT_ID,
  workspaceId: SOURCE,
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
    workspaces: [workspace(TARGET, 'target'), workspace(SOURCE, 'source')],
    projects: [project()],
    currentWorkspaceId: null,
    mergeWorkspaces: vi.fn(async () => undefined),
    setCurrentWorkspace: vi.fn(async () => undefined),
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
});

describe('adoptProject', () => {
  it('merges the whole source workspace when it is a 1:1 shell', async () => {
    h.describeProjectAdoption.mockResolvedValueOnce({
      sourceWorkspaceId: SOURCE,
      isShell: true,
      sessionCount: 4,
    });
    const store = harness({});

    const result = await adoptProject(
      store.set,
      store.get,
    )({ projectId: PROJECT_ID, targetWorkspaceId: TARGET });

    expect(store.state.mergeWorkspaces).toHaveBeenCalledWith({
      sourceWorkspaceIds: [SOURCE],
      targetWorkspaceId: TARGET,
    });
    expect(h.moveProjectToWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual({
      movedSessionCount: 4,
      ambiguousSessionCount: 0,
      mergedWorkspace: true,
    });
  });

  it('moves only the project and its sessions from a multi-project source', async () => {
    h.describeProjectAdoption.mockResolvedValueOnce({
      sourceWorkspaceId: SOURCE,
      isShell: false,
      sessionCount: 3,
    });
    h.moveProjectToWorkspace.mockResolvedValueOnce({
      movedSessionCount: 2,
      ambiguousSessionCount: 1,
    });
    const store = harness({});

    const result = await adoptProject(
      store.set,
      store.get,
    )({ projectId: PROJECT_ID, targetWorkspaceId: TARGET });

    expect(store.state.mergeWorkspaces).not.toHaveBeenCalled();
    expect(h.moveProjectToWorkspace).toHaveBeenCalledWith({
      db: {},
      projectId: PROJECT_ID,
      targetWorkspaceId: TARGET,
    });
    expect(store.state.projects[0]?.workspaceId).toBe(TARGET);
    expect(result).toEqual({
      movedSessionCount: 2,
      ambiguousSessionCount: 1,
      mergedWorkspace: false,
    });
    expect(store.state.emitNotification).not.toHaveBeenCalled();
  });

  it('reloads the target workspace when it is current', async () => {
    h.describeProjectAdoption.mockResolvedValueOnce({
      sourceWorkspaceId: SOURCE,
      isShell: false,
      sessionCount: 1,
    });
    h.moveProjectToWorkspace.mockResolvedValueOnce({
      movedSessionCount: 1,
      ambiguousSessionCount: 0,
    });
    const store = harness({ currentWorkspaceId: TARGET });

    await adoptProject(store.set, store.get)({ projectId: PROJECT_ID, targetWorkspaceId: TARGET });

    expect(store.state.setCurrentWorkspace).toHaveBeenCalledWith(TARGET);
  });

  it('reconnects a disconnected project after moving it', async () => {
    h.describeProjectAdoption.mockResolvedValueOnce({
      sourceWorkspaceId: SOURCE,
      isShell: false,
      sessionCount: 0,
    });
    h.moveProjectToWorkspace.mockResolvedValueOnce({
      movedSessionCount: 0,
      ambiguousSessionCount: 0,
    });
    const store = harness({ projects: [project({ disconnectedAt: NOW })] });

    await adoptProject(store.set, store.get)({ projectId: PROJECT_ID, targetWorkspaceId: TARGET });

    expect(h.reconnectProject).toHaveBeenCalledWith(expect.objectContaining({ id: PROJECT_ID }));
    expect(store.state.projects[0]?.disconnectedAt).toBeUndefined();
  });

  it('does nothing when the project already lives in the target', async () => {
    const store = harness({ projects: [project({ workspaceId: TARGET })] });

    const result = await adoptProject(
      store.set,
      store.get,
    )({ projectId: PROJECT_ID, targetWorkspaceId: TARGET });

    expect(result).toEqual({
      movedSessionCount: 0,
      ambiguousSessionCount: 0,
      mergedWorkspace: false,
    });
    expect(h.describeProjectAdoption).not.toHaveBeenCalled();
  });
});
