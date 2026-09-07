import { describe, expect, it } from 'vitest';
import type { IsoDateTime, OverrideSettings, ProjectId, WorkspaceId } from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from '../migrations/runner';
import { insertWorkspace } from './workspace';
import { insertProject } from './project';
import {
  getProjectOverrides,
  getWorkspaceOverrides,
  setProjectOverrides,
  setWorkspaceOverrides,
} from './settings-overrides';

const WS_ID = 'w1' as WorkspaceId;
const PROJECT_ID = 'p1' as ProjectId;

const EMPTY: OverrideSettings = {
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

async function makeDb() {
  const db = makeTestDatabase();
  await migrate(db);
  const now = new Date().toISOString() as IsoDateTime;
  await insertWorkspace({
    db,
    workspace: {
      id: WS_ID,
      name: 'my-repo',
      slug: 'my-repo',
      sessionsRoot: '/tmp/my-repo',
      overrides: EMPTY,
      createdAt: now,
      updatedAt: now,
    },
  });
  return db;
}

describe('workspace overrides', () => {
  it('round-trips role preferences and the routing pool', async () => {
    const db = await makeDb();
    await setWorkspaceOverrides(db, WS_ID, {
      ...EMPTY,
      roleModels: {
        reviewer: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
      },
      providerPool: ['anthropic', 'codex'],
    });

    const stored = await getWorkspaceOverrides(db, WS_ID);

    expect(stored?.roleModels).toEqual({
      reviewer: { providerId: 'anthropic', model: 'claude-opus-5', effort: 'max' },
    });
    expect(stored?.providerPool).toEqual(['anthropic', 'codex']);
  });

  it('round-trips the attribution footer switch', async () => {
    const db = await makeDb();

    expect((await getWorkspaceOverrides(db, WS_ID))?.attributionFooter).toBeNull();

    await setWorkspaceOverrides(db, WS_ID, { ...EMPTY, attributionFooter: false });
    expect((await getWorkspaceOverrides(db, WS_ID))?.attributionFooter).toBe(false);

    await setWorkspaceOverrides(db, WS_ID, { ...EMPTY, attributionFooter: true });
    expect((await getWorkspaceOverrides(db, WS_ID))?.attributionFooter).toBe(true);

    await setWorkspaceOverrides(db, WS_ID, { ...EMPTY, attributionFooter: null });
    expect((await getWorkspaceOverrides(db, WS_ID))?.attributionFooter).toBeNull();
  });

  it('stores no row value for an empty preference map', async () => {
    const db = await makeDb();
    await setWorkspaceOverrides(db, WS_ID, { ...EMPTY, roleModels: {} });

    expect((await getWorkspaceOverrides(db, WS_ID))?.roleModels).toBeNull();
  });
});

describe('project overrides', () => {
  it('round-trips the routing pool', async () => {
    const db = await makeDb();
    const now = new Date().toISOString() as IsoDateTime;
    await insertProject({
      db,
      project: {
        id: PROJECT_ID,
        workspaceId: WS_ID,
        name: 'my-repo',
        rootPath: '/tmp/my-repo',
        kind: 'repo',
        baseBranch: null,
        overrides: EMPTY,
        createdAt: now,
        updatedAt: now,
      },
    });

    expect((await getProjectOverrides(db, PROJECT_ID))?.providerPool).toBeNull();

    await setProjectOverrides(db, PROJECT_ID, { ...EMPTY, providerPool: ['anthropic', 'codex'] });
    expect((await getProjectOverrides(db, PROJECT_ID))?.providerPool).toEqual([
      'anthropic',
      'codex',
    ]);

    await setProjectOverrides(db, PROJECT_ID, { ...EMPTY, providerPool: null });
    expect((await getProjectOverrides(db, PROJECT_ID))?.providerPool).toBeNull();
  });
});
