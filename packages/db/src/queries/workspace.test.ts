import { describe, expect, it, vi } from 'vitest';
import type { IsoDateTime, OverrideSettings, Workspace, WorkspaceId } from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from '../migrations/runner';
import {
  deleteWorkspace,
  disconnectWorkspace,
  getWorkspaceById,
  insertWorkspace,
  listDisconnectedWorkspaces,
  listWorkspaces,
  reconnectWorkspace,
  renameWorkspace,
  touchWorkspaceLastAccessed,
  upsertWorkspaceProfile,
} from './workspace';

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

type MakeWorkspaceParams = {
  readonly id?: string;
  readonly overrides?: Partial<Workspace>;
};

const makeWorkspace = ({ id = 'workspace-1', overrides = {} }: MakeWorkspaceParams): Workspace => ({
  id: id as WorkspaceId,
  name: 'Demo Team',
  slug: id,
  sessionsRoot: '/tmp/demo-team-sessions',
  overrides: EMPTY_OVERRIDES,
  createdAt: at({ value: '2026-08-22T10:00:00Z' }),
  updatedAt: at({ value: '2026-08-22T10:05:00Z' }),
  ...overrides,
});

const makeDb = async () => {
  const db = makeTestDatabase();
  await migrate(db);
  return db;
};

describe('workspace queries', () => {
  it('round-trips a container, its overrides, and its profile', async () => {
    const db = await makeDb();
    const workspace = makeWorkspace({
      overrides: {
        profile: {
          bio: 'I build the platform tooling for this team.',
        },
        overrides: {
          ...EMPTY_OVERRIDES,
          defaultProviderId: 'codex',
          defaultBranchPrefix: 'ak/',
          parallelEnabled: true,
          providerPool: ['codex', 'anthropic'],
        },
      },
    });

    await insertWorkspace({ db, workspace });

    expect(await getWorkspaceById({ db, id: workspace.id })).toEqual({
      ...workspace,
      lastAccessedAt: workspace.updatedAt,
    });
  });

  it('keeps active and disconnected containers in separate lists', async () => {
    const db = await makeDb();
    const active = makeWorkspace({ id: 'active' });
    const disconnected = makeWorkspace({
      id: 'disconnected',
      overrides: { disconnectedAt: at({ value: '2026-08-22T11:00:00Z' }) },
    });
    await insertWorkspace({ db, workspace: active });
    await insertWorkspace({ db, workspace: disconnected });

    expect((await listWorkspaces({ db })).map((workspace) => workspace.id)).toEqual([active.id]);
    expect((await listDisconnectedWorkspaces({ db })).map((workspace) => workspace.id)).toEqual([
      disconnected.id,
    ]);
  });

  it('updates container identity and presence timestamps', async () => {
    vi.useFakeTimers();
    const db = await makeDb();
    const workspace = makeWorkspace({});
    await insertWorkspace({ db, workspace });

    vi.setSystemTime(new Date('2026-08-22T12:00:00Z'));
    await renameWorkspace({ db, id: workspace.id, name: 'Goodboy' });
    await touchWorkspaceLastAccessed({ db, id: workspace.id });
    await disconnectWorkspace({
      db,
      id: workspace.id,
      at: at({ value: '2026-08-22T12:10:00Z' }),
    });
    await reconnectWorkspace({
      db,
      id: workspace.id,
      at: at({ value: '2026-08-22T12:20:00Z' }),
    });

    const stored = await getWorkspaceById({ db, id: workspace.id });
    expect(stored?.name).toBe('Goodboy');
    expect(stored?.disconnectedAt).toBeUndefined();
    expect(stored?.lastAccessedAt).toBe(at({ value: '2026-08-22T12:20:00Z' }));
    vi.useRealTimers();
  });

  it('upserts a profile independently', async () => {
    const db = await makeDb();
    const workspace = makeWorkspace({});
    await insertWorkspace({ db, workspace });
    await upsertWorkspaceProfile({
      db,
      workspaceId: workspace.id,
      profile: { bio: 'I review outcomes, not diffs.' },
    });

    expect((await getWorkspaceById({ db, id: workspace.id }))?.profile).toEqual({
      bio: 'I review outcomes, not diffs.',
    });
  });

  it('hard-deletes a container', async () => {
    const db = await makeDb();
    const workspace = makeWorkspace({});
    await insertWorkspace({ db, workspace });
    await deleteWorkspace({ db, id: workspace.id });
    expect(await getWorkspaceById({ db, id: workspace.id })).toBeNull();
  });
});
