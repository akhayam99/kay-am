import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  WorkspaceId,
} from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from '../migrations/runner';
import {
  deleteProject,
  disconnectProject,
  findProjectByRootPath,
  getProjectById,
  insertProject,
  listDisconnectedProjects,
  listProjectsForWorkspace,
  reconnectProject,
  renameProject,
  updateProjectKind,
  updateProjectBaseBranch,
} from './project';

const workspaceId = 'workspace-1' as WorkspaceId;
const EMPTY_OVERRIDES: OverrideSettings = {
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

const at = ({ value }: { readonly value: string }): IsoDateTime =>
  new Date(value).toISOString() as IsoDateTime;

type MakeProjectParams = {
  readonly id?: string;
  readonly overrides?: Partial<Project>;
};

const makeProject = ({ id = 'project-1', overrides = {} }: MakeProjectParams): Project => ({
  id: id as ProjectId,
  workspaceId,
  name: id,
  rootPath: `/tmp/${id}`,
  kind: 'repo',
  baseBranch: null,
  overrides: EMPTY_OVERRIDES,
  createdAt: at({ value: '2026-08-22T10:00:00Z' }),
  updatedAt: at({ value: '2026-08-22T10:05:00Z' }),
  ...overrides,
});

const makeDb = async () => {
  const db = makeTestDatabase();
  await migrate(db);
  const now = Date.now();
  await db.execute(
    `INSERT INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, 'Demo Team', 'demo-team', ?, ?)`,
    [workspaceId, now, now],
  );
  return db;
};

describe('project queries', () => {
  it('round-trips project identity, kind, path, and overrides', async () => {
    const db = await makeDb();
    const project = makeProject({
      overrides: {
        overrides: { ...EMPTY_OVERRIDES, defaultBranchPrefix: 'ak/', parallelAgents: true },
      },
    });
    await insertProject({ db, project });
    expect(await getProjectById({ db, id: project.id })).toEqual({
      ...project,
      lastAccessedAt: project.updatedAt,
    });
    expect(await findProjectByRootPath({ db, rootPath: project.rootPath })).not.toBeNull();
  });

  it('finds a project by root path regardless of trailing slashes on either side', async () => {
    const db = await makeDb();
    const clean = makeProject({ id: 'clean' });
    const slashed = makeProject({
      id: 'slashed',
      overrides: { rootPath: '/tmp/slashed/' },
    });
    await insertProject({ db, project: clean });
    await insertProject({ db, project: slashed });

    expect((await findProjectByRootPath({ db, rootPath: '/tmp/clean/' }))?.id).toBe(clean.id);
    expect((await findProjectByRootPath({ db, rootPath: '/tmp/slashed' }))?.id).toBe(slashed.id);
    expect(await findProjectByRootPath({ db, rootPath: '/tmp/ghost/' })).toBeNull();
  });

  it('lists active and disconnected projects for one container', async () => {
    const db = await makeDb();
    const active = makeProject({ id: 'active' });
    const disconnected = makeProject({
      id: 'disconnected',
      overrides: { disconnectedAt: at({ value: '2026-08-22T11:00:00Z' }) },
    });
    await insertProject({ db, project: active });
    await insertProject({ db, project: disconnected });
    expect(
      (await listProjectsForWorkspace({ db, workspaceId })).map((project) => project.id),
    ).toEqual([active.id]);
    expect(
      (await listDisconnectedProjects({ db, workspaceId })).map((project) => project.id),
    ).toEqual([disconnected.id]);
  });

  it('converts a folder project and updates its canonical path', async () => {
    const db = await makeDb();
    const project = makeProject({ overrides: { kind: 'folder' } });
    await insertProject({ db, project });
    await updateProjectKind({ db, id: project.id, kind: 'repo', rootPath: '/tmp/repository' });
    await renameProject({ db, id: project.id, name: 'Repository' });
    const stored = await getProjectById({ db, id: project.id });
    expect(stored?.kind).toBe('repo');
    expect(stored?.rootPath).toBe('/tmp/repository');
    expect(stored?.name).toBe('Repository');
  });

  it('updates and clears the project base branch', async () => {
    const db = await makeDb();
    const project = makeProject({});
    await insertProject({ db, project });
    await updateProjectBaseBranch({ db, projectId: project.id, baseBranch: 'develop' });
    expect((await getProjectById({ db, id: project.id }))?.baseBranch).toBe('develop');
    await updateProjectBaseBranch({ db, projectId: project.id, baseBranch: null });
    expect((await getProjectById({ db, id: project.id }))?.baseBranch).toBeNull();
  });

  it('disconnects, reconnects, and deletes a project', async () => {
    const db = await makeDb();
    const project = makeProject({});
    await insertProject({ db, project });
    await disconnectProject({ db, id: project.id, at: at({ value: '2026-08-22T11:00:00Z' }) });
    expect((await getProjectById({ db, id: project.id }))?.disconnectedAt).toBeDefined();
    await reconnectProject({ db, id: project.id, at: at({ value: '2026-08-22T12:00:00Z' }) });
    expect((await getProjectById({ db, id: project.id }))?.disconnectedAt).toBeUndefined();
    await deleteProject({ db, id: project.id });
    expect(await getProjectById({ db, id: project.id })).toBeNull();
  });
});
