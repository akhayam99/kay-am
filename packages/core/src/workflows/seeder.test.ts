import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { IsoDateTime, WorkspaceId } from '@goodboy/types';
import { migrate, listWorkflows, insertWorkspace, type Database as DbInterface } from '@goodboy/db';
import { WORKFLOW_LIBRARY } from './library';
import { seedWorkflowLibrary } from './seeder';
import { PROVIDER_CAPABILITIES } from '../providers/capabilities';

const now = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

function makeDb(): DbInterface {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async execute(sql, params = []) {
      const stmt = db.prepare(sql);
      const result = stmt.run(...(params as ReadonlyArray<never>));
      return { rowsAffected: result.changes };
    },
    async select<T>(sql: string, params: ReadonlyArray<unknown> = []) {
      const stmt = db.prepare(sql);
      return stmt.all(...(params as ReadonlyArray<never>)) as unknown as ReadonlyArray<T>;
    },
  };
}

async function setup() {
  const db = makeDb();
  await migrate(db);
  const workspaceId = 'ws_seed_test' as WorkspaceId;
  await insertWorkspace({
    db,
    workspace: {
      id: workspaceId,
      name: 'seed-test',
      slug: 'seed-test',
      sessionsRoot: '/tmp/seed-test',
      overrides: {
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
      },
      createdAt: now(),
      updatedAt: now(),
    },
  });
  return { db, workspaceId };
}

describe('seedWorkflowLibrary', () => {
  it('seeds all library entries with deterministic ids', async () => {
    const { db, workspaceId } = await setup();
    const result = await seedWorkflowLibrary({ db }, workspaceId);

    expect(result.seeded).toHaveLength(WORKFLOW_LIBRARY.length);
    for (const entry of WORKFLOW_LIBRARY) {
      const seeded = result.seeded.find((s) => s.slug === entry.slug);
      expect(seeded).toBeDefined();
      expect(seeded!.workflowId).toBe(`wf_seed_${entry.slug}_${workspaceId}`);
    }
  });

  it('persists each entry with its steps in the right order', async () => {
    const { db, workspaceId } = await setup();
    await seedWorkflowLibrary({ db }, workspaceId);

    const workflows = await listWorkflows(db, workspaceId);
    expect(workflows).toHaveLength(WORKFLOW_LIBRARY.length);

    for (const entry of WORKFLOW_LIBRARY) {
      const wf = workflows.find((w) => w.name === entry.name);
      expect(wf).toBeDefined();
      expect(wf!.steps).toHaveLength(entry.steps.length);
      entry.steps.forEach((s, i) => {
        expect(wf!.steps[i]!.name).toBe(s.name);
        expect(wf!.steps[i]!.ordinal).toBe(i);
        expect(wf!.steps[i]!.promptPrefix).toBe(s.promptPrefix);
        expect(wf!.steps[i]!.expectedOutput).toBe(s.expectedOutput);
      });
    }
  });

  it('is idempotent: re-seeding does not duplicate', async () => {
    const { db, workspaceId } = await setup();
    await seedWorkflowLibrary({ db }, workspaceId);
    await seedWorkflowLibrary({ db }, workspaceId);

    const workflows = await listWorkflows(db, workspaceId);
    expect(workflows).toHaveLength(WORKFLOW_LIBRARY.length);
  });

  it('uses the injected now() if provided', async () => {
    const { db, workspaceId } = await setup();
    const fixed = '2026-05-09T12:00:00.000Z' as IsoDateTime;
    await seedWorkflowLibrary({ db, now: () => fixed }, workspaceId);

    const workflows = await listWorkflows(db, workspaceId);
    for (const wf of workflows) {
      expect(wf.createdAt).toBe(fixed);
      expect(wf.updatedAt).toBe(fixed);
    }
  });

  describe('provider routing (regression for cursor/codex sessions)', () => {
    it('does not hardcode providerOverride on seeded steps', async () => {
      const { db, workspaceId } = await setup();
      await seedWorkflowLibrary({ db }, workspaceId);

      const workflows = await listWorkflows(db, workspaceId);
      const steps = workflows.flatMap((w) => w.steps);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((s) => s.providerOverride === undefined)).toBe(true);
    });

    it('does not pin anthropic model IDs on seeded steps', async () => {
      const { db, workspaceId } = await setup();
      await seedWorkflowLibrary({ db }, workspaceId);

      const workflows = await listWorkflows(db, workspaceId);
      const steps = workflows.flatMap((w) => w.steps);

      const anthropicModelIds = new Set(PROVIDER_CAPABILITIES.anthropic.models.map((m) => m.id));

      const stepsWithAnthropicModelId = steps.filter(
        (s) => s.modelOverride !== undefined && anthropicModelIds.has(s.modelOverride),
      );

      expect(stepsWithAnthropicModelId).toHaveLength(0);
    });
  });
});
