import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IsoDateTime, Project, ProjectId, Workspace, WorkspaceId } from '@goodboy/types';
import type { AppStore } from '../../store';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({
  mergeWorkspacesInDb: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/db', () => ({
  mergeWorkspaces: h.mergeWorkspacesInDb,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import { mergeWorkspaces } from './mergeWorkspaces';

const NOW = '2026-08-22T00:00:00.000Z' as IsoDateTime;
const TARGET = 'ws-target' as WorkspaceId;
const SOURCE = 'ws-source' as WorkspaceId;

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

const project = (id: string, workspaceId: WorkspaceId): Project => ({
  id: id as ProjectId,
  workspaceId,
  name: id,
  rootPath: `/repos/${id}`,
  kind: 'repo',
  overrides,
  createdAt: NOW,
  updatedAt: NOW,
});

type Harness = {
  state: AppStore;
  set: SetFn;
  get: GetFn;
};

const harness = (initial: Record<string, unknown>): Harness => {
  let state = {
    workspaces: [workspace(TARGET, 'target'), workspace(SOURCE, 'source')],
    projects: [project('proj-t', TARGET), project('proj-s', SOURCE)],
    currentWorkspaceId: null,
    archivedSessions: { [SOURCE]: [] },
    workspaceIntegrations: { [SOURCE]: [] },
    projectScripts: {},
    workspaceOverrides: { [SOURCE]: overrides },
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

describe('mergeWorkspaces slice action', () => {
  it('merges in the database and reassigns state to the target', async () => {
    const store = harness({});

    await mergeWorkspaces(
      store.set,
      store.get,
    )({ sourceWorkspaceIds: [SOURCE], targetWorkspaceId: TARGET });

    expect(h.mergeWorkspacesInDb).toHaveBeenCalledWith({
      db: {},
      sourceWorkspaceIds: [SOURCE],
      targetWorkspaceId: TARGET,
    });
    expect(store.state.workspaces.map((entry) => entry.id)).toEqual([TARGET]);
    expect(store.state.projects.map((entry) => entry.workspaceId)).toEqual([TARGET, TARGET]);
    expect(store.state.archivedSessions[SOURCE]).toBeUndefined();
    expect(store.state.workspaceIntegrations[SOURCE]).toBeUndefined();
    expect(store.state.workspaceOverrides[SOURCE]).toBeUndefined();
  });

  it('reloads the current workspace when it is the merge target', async () => {
    const store = harness({ currentWorkspaceId: TARGET });

    await mergeWorkspaces(
      store.set,
      store.get,
    )({ sourceWorkspaceIds: [SOURCE], targetWorkspaceId: TARGET });

    expect(store.state.setCurrentWorkspace).toHaveBeenCalledWith(TARGET);
  });

  it('refuses an unknown target and touches nothing', async () => {
    const store = harness({});

    await expect(
      mergeWorkspaces(
        store.set,
        store.get,
      )({ sourceWorkspaceIds: [SOURCE], targetWorkspaceId: 'ws-ghost' as WorkspaceId }),
    ).rejects.toThrow(/workspace not found/);

    expect(h.mergeWorkspacesInDb).not.toHaveBeenCalled();
    expect(store.state.workspaces).toHaveLength(2);
  });

  it('does nothing when only the target itself is selected', async () => {
    const store = harness({});

    await mergeWorkspaces(
      store.set,
      store.get,
    )({ sourceWorkspaceIds: [TARGET], targetWorkspaceId: TARGET });

    expect(h.mergeWorkspacesInDb).not.toHaveBeenCalled();
    expect(store.state.workspaces).toHaveLength(2);
  });
});
