import { describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  OverrideSettings,
  Agent,
  AgentId,
  Session,
  SessionId,
  Step,
  StepId,
  Workflow,
  WorkflowId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { DEFAULT_SESSION_PROVIDER_PREFERENCE } from '@goodboy/types';
import type { Database } from '../client';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from './runner';
import { runRuntimeMigrations, type MigrationSnapshotStorage } from './runRuntimeMigrations';
import { migrations, type Migration } from './index';
import { getWorkspaceById, insertWorkspace } from '../queries/workspace';
import { getSessionById, insertSession } from '../queries/session';
import { listWorkflows, getWorkflow, upsertWorkflow, deleteWorkflow } from '../queries/workflow';
import { listAgentsForSession, updateAgentStatus } from '../queries/agent';
import {
  insertSessionWorktree,
  listWorktreesForSession,
  deleteWorktreesForSession,
} from '../queries/session-worktree';

const now = (): IsoDateTime => new Date().toISOString() as IsoDateTime;
const preProjectMigrations = migrations.filter((migration) => migration.version <= 116);
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

const insertCurrentWorkspace = async ({
  db,
  workspace,
}: {
  readonly db: Database;
  readonly workspace: Workspace;
}): Promise<void> => {
  await db.execute(
    `INSERT INTO workspaces (id, name, slug, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [workspace.id, workspace.name, workspace.id, Date.now(), Date.now()],
  );
  await db.execute(
    `INSERT INTO projects (id, workspace_id, name, root_path, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'repo', ?, ?)`,
    [
      workspace.id,
      workspace.id,
      workspace.name,
      workspace.sessionsRoot ?? `/tmp/${workspace.slug}`,
      Date.now(),
      Date.now(),
    ],
  );
};

type Params = {
  readonly database: Database;
  readonly failureStatement?: string;
  readonly statements?: string[];
};

const makeForwardingDatabase = ({
  database,
  failureStatement,
  statements = [],
}: Params): Database => {
  let hasFailed = false;

  return {
    exec: async (sql) => {
      statements.push(sql);
      await database.exec(sql);
      if (!hasFailed && failureStatement != null && sql.includes(failureStatement)) {
        hasFailed = true;
        throw new Error(`Injected failure after ${failureStatement}`);
      }
    },
    execute: async (sql, params) => {
      statements.push(sql);
      const result = await database.execute(sql, params);
      if (!hasFailed && failureStatement != null && sql.includes(failureStatement)) {
        hasFailed = true;
        throw new Error(`Injected failure after ${failureStatement}`);
      }
      return result;
    },
    select: async <T>(sql: string, params?: ReadonlyArray<unknown>) =>
      database.select<T>(sql, params),
  };
};

type MakeSnapshotDatabaseParams = {
  readonly database: Database;
  readonly onVacuum?: (sql: string) => Promise<void>;
  readonly statements?: string[];
};

const makeSnapshotDatabase = ({
  database,
  onVacuum = async () => undefined,
  statements = [],
}: MakeSnapshotDatabaseParams): Database => ({
  exec: async (sql) => {
    statements.push(sql);
    if (sql.startsWith('VACUUM INTO')) {
      await onVacuum(sql);
      return;
    }
    await database.exec(sql);
  },
  execute: async (sql, params) => {
    statements.push(sql);
    return database.execute(sql, params);
  },
  select: async <T>(sql: string, params?: ReadonlyArray<unknown>) =>
    database.select<T>(sql, params),
});

describe('runRuntimeMigrations', () => {
  const migration = {
    version: 1,
    sql: 'CREATE TABLE snapshot_test (id INTEGER PRIMARY KEY);',
  } satisfies Migration;

  it('creates a versioned snapshot before the first pending migration', async () => {
    const database = makeTestDatabase();
    await migrate(database, [migration]);
    const pendingMigration = {
      version: 2,
      sql: 'CREATE TABLE pending_snapshot_test (id INTEGER PRIMARY KEY);',
    } satisfies Migration;
    const statements: string[] = [];
    const db = makeSnapshotDatabase({ database, statements });
    const storage = {
      list: vi.fn(async () => ['/tmp/data.db.pre-m1-20260822T120000000Z.bak']),
      remove: vi.fn(async () => undefined),
    } satisfies MigrationSnapshotStorage;

    await runRuntimeMigrations({
      databasePath: '/tmp/data.db',
      db,
      migrations: [migration, pendingMigration],
      now: () => new Date('2026-08-22T12:00:00.000Z'),
      storage,
    });

    const snapshotIndex = statements.findIndex((statement) => statement.startsWith('VACUUM INTO'));
    const migrationIndex = statements.findIndex((statement) =>
      statement.includes('CREATE TABLE pending_snapshot_test'),
    );
    expect(statements[snapshotIndex]).toBe(
      "VACUUM INTO '/tmp/data.db.pre-m1-20260822T120000000Z.bak'",
    );
    expect(snapshotIndex).toBeLessThan(migrationIndex);
  });

  it('skips snapshots when there are no pending migrations', async () => {
    const database = makeTestDatabase();
    await migrate(database, [migration]);
    const statements: string[] = [];
    const storage = {
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
    } satisfies MigrationSnapshotStorage;

    await runRuntimeMigrations({
      databasePath: '/tmp/data.db',
      db: makeSnapshotDatabase({ database, statements }),
      migrations: [migration],
      storage,
    });

    expect(statements.some((statement) => statement.startsWith('VACUUM INTO'))).toBe(false);
    expect(storage.list).not.toHaveBeenCalled();
  });

  it.each([null, '', ':memory:'])(
    'skips snapshots for the non-file path %s',
    async (databasePath) => {
      const database = makeTestDatabase();
      const statements: string[] = [];
      const storage = {
        list: vi.fn(async () => []),
        remove: vi.fn(async () => undefined),
      } satisfies MigrationSnapshotStorage;

      await runRuntimeMigrations({
        databasePath,
        db: makeSnapshotDatabase({ database, statements }),
        migrations: [migration],
        storage,
      });

      expect(statements.some((statement) => statement.startsWith('VACUUM INTO'))).toBe(false);
      expect(storage.list).not.toHaveBeenCalled();
    },
  );

  it('aborts before applying migrations when snapshot creation fails', async () => {
    const database = makeTestDatabase();
    const db = makeSnapshotDatabase({
      database,
      onVacuum: async () => {
        throw new Error('disk full');
      },
    });
    const storage = {
      list: vi.fn(async () => []),
      remove: vi.fn(async () => undefined),
    } satisfies MigrationSnapshotStorage;

    await expect(
      runRuntimeMigrations({
        databasePath: '/tmp/data.db',
        db,
        migrations: [migration],
        storage,
      }),
    ).rejects.toThrow('Database migration snapshot failed; migrations were not started: disk full');
    const tables = await database.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'snapshot_test'",
    );
    expect(tables).toEqual([]);
  });

  it('retains the two newest migration snapshots', async () => {
    const database = makeTestDatabase();
    const remove = vi.fn(async () => undefined);
    const storage = {
      list: vi.fn(async () => [
        '/tmp/data.db.pre-m120-20260820T120000000Z.bak',
        '/tmp/data.db.pre-m9-20260821T120000000Z.bak',
        '/tmp/data.db.pre-m0-20260822T120000000Z.bak',
      ]),
      remove,
    } satisfies MigrationSnapshotStorage;

    await runRuntimeMigrations({
      databasePath: '/tmp/data.db',
      db: makeSnapshotDatabase({ database }),
      migrations: [migration],
      now: () => new Date('2026-08-22T12:00:00.000Z'),
      storage,
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith({
      path: '/tmp/data.db.pre-m120-20260820T120000000Z.bak',
    });
  });
});

describe('migrate', () => {
  it('applies all migrations on a fresh db', async () => {
    const db = makeTestDatabase();
    const result = await migrate(db);
    expect(result.applied).toEqual(migrations.map((m) => m.version));
    expect(result.skipped).toEqual([]);
    expect(result.currentVersion).toBe(migrations.at(-1)?.version);
  });

  it('is idempotent: re-running applies nothing', async () => {
    const db = makeTestDatabase();
    await migrate(db);
    const second = await migrate(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(migrations.map((m) => m.version));
  });

  describe('transaction safety', () => {
    it('rolls back a rebuild failure and applies it cleanly on retry', async () => {
      const database = makeTestDatabase();
      await migrate(
        database,
        migrations.filter((migration) => migration.version < 67),
      );
      await database.exec('PRAGMA foreign_keys = OFF');
      await database.execute(
        `INSERT INTO provider_runs
          (id, session_id, provider, model, status_kind, status_payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['run-crash', 'missing-session', 'anthropic', 'model', 'pending', '{}', 1],
      );
      await database.exec('PRAGMA foreign_keys = ON');

      const rebuildMigration = migrations.find((migration) => migration.version === 67);
      if (rebuildMigration == null) {
        throw new Error('Migration 67 should exist');
      }
      const failingDatabase = makeForwardingDatabase({
        database,
        failureStatement: 'DROP TABLE provider_runs',
      });

      await expect(migrate(failingDatabase, [rebuildMigration])).rejects.toThrow(
        'Injected failure',
      );

      const runsAfterFailure = await database.select<{ id: string }>(
        'SELECT id FROM provider_runs',
      );
      const versionsAfterFailure = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 67',
      );
      const foreignKeysAfterFailure = await database.select<{ foreign_keys: number }>(
        'PRAGMA foreign_keys',
      );
      expect({
        foreignKeys: foreignKeysAfterFailure[0]?.foreign_keys,
        runs: runsAfterFailure,
        versions: versionsAfterFailure,
      }).toEqual({ foreignKeys: 1, runs: [{ id: 'run-crash' }], versions: [] });

      const result = await migrate(database, [rebuildMigration]);
      const runsAfterRetry = await database.select<{ id: string }>('SELECT id FROM provider_runs');
      const versionsAfterRetry = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 67',
      );
      expect({
        applied: result.applied,
        runs: runsAfterRetry,
        versions: versionsAfterRetry,
      }).toEqual({
        applied: [67],
        runs: [{ id: 'run-crash' }],
        versions: [{ version: 67 }],
      });
    });

    it('rolls back the final segment when version recording fails', async () => {
      const database = makeTestDatabase();
      const migration = {
        version: 1001,
        sql: `
          CREATE TABLE final_segment_test (id INTEGER PRIMARY KEY);
          INSERT INTO final_segment_test (id) VALUES (1);
        `,
      } satisfies Migration;
      const failingDatabase = makeForwardingDatabase({
        database,
        failureStatement: 'INSERT OR IGNORE INTO schema_version',
      });

      await expect(migrate(failingDatabase, [migration])).rejects.toThrow('Injected failure');

      const tables = await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'final_segment_test'",
      );
      const versions = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 1001',
      );
      expect({ tables, versions }).toEqual({ tables: [], versions: [] });
    });

    it('does not roll back a transaction it did not begin', async () => {
      const database = makeTestDatabase();
      const statements: string[] = [];
      const forwardingDatabase = makeForwardingDatabase({ database, statements });
      const migration = {
        version: 1002,
        sql: 'CREATE TABLE begin_ownership_test (id INTEGER PRIMARY KEY);',
      } satisfies Migration;
      await database.exec('BEGIN IMMEDIATE');

      await expect(migrate(forwardingDatabase, [migration])).rejects.toThrow(
        'cannot start a transaction within a transaction',
      );

      expect(statements).toContain('BEGIN IMMEDIATE');
      expect(statements).not.toContain('ROLLBACK');
      await database.exec('ROLLBACK');
    });

    it('records a pragma-only migration once', async () => {
      const database = makeTestDatabase();
      const statements: string[] = [];
      const forwardingDatabase = makeForwardingDatabase({ database, statements });
      const migration = {
        version: 1003,
        sql: 'PRAGMA foreign_keys = ON;',
      } satisfies Migration;

      const first = await migrate(forwardingDatabase, [migration]);
      const second = await migrate(forwardingDatabase, [migration]);
      const versions = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 1003',
      );
      const pragmaExecutions = statements.filter(
        (statement) => statement === 'PRAGMA foreign_keys = ON',
      ).length;
      expect({ first, pragmaExecutions, second, versions }).toEqual({
        first: { applied: [1003], currentVersion: 1003, skipped: [] },
        pragmaExecutions: 1,
        second: { applied: [], currentVersion: 1003, skipped: [1003] },
        versions: [{ version: 1003 }],
      });
    });
  });

  describe('segment resume', () => {
    it('skips checkpointed work while replaying foreign key pragmas', async () => {
      const database = makeTestDatabase();
      const migration = {
        version: 1002,
        sql: `
          PRAGMA foreign_keys = ON;
          CREATE TABLE resume_first (id INTEGER PRIMARY KEY);
          INSERT INTO resume_first (id) VALUES (1);
          PRAGMA foreign_keys = OFF;
          CREATE TABLE resume_final (id INTEGER PRIMARY KEY);
          INSERT INTO resume_final (id) VALUES (2);
          PRAGMA foreign_keys = ON;
        `,
      } satisfies Migration;
      const failingDatabase = makeForwardingDatabase({
        database,
        failureStatement: 'PRAGMA foreign_keys = OFF',
      });

      await expect(migrate(failingDatabase, [migration])).rejects.toThrow('Injected failure');

      const checkpointsAfterFailure = await database.select<{ segment: number }>(
        'SELECT segment FROM schema_migration_segment WHERE version = 1002',
      );
      expect(checkpointsAfterFailure).toEqual([{ segment: 0 }]);

      const resumedStatements: string[] = [];
      const resumedDatabase = makeForwardingDatabase({ database, statements: resumedStatements });
      const result = await migrate(resumedDatabase, [migration]);
      const firstRows = await database.select<{ id: number }>('SELECT id FROM resume_first');
      const finalRows = await database.select<{ id: number }>('SELECT id FROM resume_final');
      const checkpointsAfterRetry = await database.select<{ segment: number }>(
        'SELECT segment FROM schema_migration_segment WHERE version = 1002',
      );
      const versions = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 1002',
      );
      expect({
        applied: result.applied,
        checkpoints: checkpointsAfterRetry,
        finalRows,
        firstRows,
        versions,
      }).toEqual({
        applied: [1002],
        checkpoints: [],
        finalRows: [{ id: 2 }],
        firstRows: [{ id: 1 }],
        versions: [{ version: 1002 }],
      });
      const resumedPragmas = resumedStatements.filter((statement) =>
        statement.startsWith('PRAGMA foreign_keys'),
      );
      expect({
        didRepeatFirstSegment: resumedStatements.some((statement) =>
          statement.includes('CREATE TABLE resume_first'),
        ),
        pragmas: resumedPragmas,
      }).toEqual({
        didRepeatFirstSegment: false,
        pragmas: [
          'PRAGMA foreign_keys = ON',
          'PRAGMA foreign_keys = OFF',
          'PRAGMA foreign_keys = ON',
        ],
      });
    });

    it('resumes the real m031 migration without repeating its renames', async () => {
      const database = makeTestDatabase();
      await migrate(
        database,
        migrations.filter((migration) => migration.version < 31),
      );
      await database.execute(
        `INSERT INTO workspaces (id, name, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['workspace-31', 'Workspace 31', '/tmp/workspace-31', 1, 1],
      );
      await database.execute(
        `INSERT INTO tasks (id, workspace_id, goal, state_kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['task-31', 'workspace-31', 'Keep m031 data', 'idle', 1, 1],
      );
      await database.execute(
        `INSERT INTO sessions (id, task_id, ordinal, name, status)
         VALUES (?, ?, ?, ?, ?)`,
        ['agent-31', 'task-31', 0, 'Agent 31', 'pending'],
      );
      await database.execute(
        `INSERT INTO permission_rules (id, scope, task_id, pattern_tool, decision)
         VALUES (?, ?, ?, ?, ?)`,
        ['rule-31', 'task', 'task-31', 'Read', 'allow'],
      );
      await database.execute(
        `INSERT INTO diff_comments
          (id, task_id, file_path, body, created_at, consumed_by_agent_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['comment-31', 'task-31', 'runner.ts', 'Keep this row', 1, 'agent-31'],
      );

      const migration = migrations.find((candidate) => candidate.version === 31);
      if (migration == null) {
        throw new Error('Migration 31 should exist');
      }
      const failingDatabase = makeForwardingDatabase({
        database,
        failureStatement: 'PRAGMA foreign_keys = OFF',
      });

      await expect(migrate(failingDatabase, [migration])).rejects.toThrow('Injected failure');

      const checkpointsAfterFailure = await database.select<{ segment: number }>(
        'SELECT segment FROM schema_migration_segment WHERE version = 31',
      );
      expect(checkpointsAfterFailure).toEqual([{ segment: 0 }]);

      const resumedStatements: string[] = [];
      const resumedDatabase = makeForwardingDatabase({ database, statements: resumedStatements });
      const result = await migrate(resumedDatabase, [migration]);
      const sessions = await database.select<{ id: string; workspace_id: string; goal: string }>(
        'SELECT id, workspace_id, goal FROM sessions WHERE id = ?',
        ['task-31'],
      );
      const agents = await database.select<{ id: string; session_id: string; name: string }>(
        'SELECT id, session_id, name FROM agents WHERE id = ?',
        ['agent-31'],
      );
      const rules = await database.select<{ id: string; scope: string; session_id: string }>(
        'SELECT id, scope, session_id FROM permission_rules WHERE id = ?',
        ['rule-31'],
      );
      const comments = await database.select<{
        id: string;
        session_id: string;
        consumed_by_agent_id: string;
      }>('SELECT id, session_id, consumed_by_agent_id FROM diff_comments WHERE id = ?', [
        'comment-31',
      ]);
      const checkpointsAfterResume = await database.select<{ segment: number }>(
        'SELECT segment FROM schema_migration_segment WHERE version = 31',
      );
      const versions = await database.select<{ version: number }>(
        'SELECT version FROM schema_version WHERE version = 31',
      );
      expect({ agents, comments, result, rules, sessions }).toEqual({
        agents: [{ id: 'agent-31', name: 'Agent 31', session_id: 'task-31' }],
        comments: [{ consumed_by_agent_id: 'agent-31', id: 'comment-31', session_id: 'task-31' }],
        result: { applied: [31], currentVersion: 31, skipped: [] },
        rules: [{ id: 'rule-31', scope: 'session', session_id: 'task-31' }],
        sessions: [{ goal: 'Keep m031 data', id: 'task-31', workspace_id: 'workspace-31' }],
      });
      expect({ checkpoints: checkpointsAfterResume, versions }).toEqual({
        checkpoints: [],
        versions: [{ version: 31 }],
      });
      expect(
        resumedStatements.some((statement) =>
          statement.includes('ALTER TABLE sessions RENAME TO agents'),
        ),
      ).toBe(false);
    });
  });

  it('round-trips a workspace through the schema', async () => {
    const db = makeTestDatabase();
    await migrate(db);

    const workspace: Workspace = {
      id: 'ws_1' as WorkspaceId,
      name: 'demo',
      slug: 'demo',
      sessionsRoot: '/tmp/demo',
      overrides: EMPTY_OVERRIDES,
      createdAt: now(),
      updatedAt: now(),
    };
    await insertWorkspace({ db, workspace });
    const fetched = await getWorkspaceById({ db, id: workspace.id });

    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('demo');
    expect(fetched?.sessionsRoot).toBe('/tmp/demo');
  });

  it('round-trips a session with discriminated turn state', async () => {
    const db = makeTestDatabase();
    await migrate(db);

    const workspace: Workspace = {
      id: 'ws_2' as WorkspaceId,
      name: 'demo',
      slug: 'demo-2',
      sessionsRoot: '/tmp/demo2',
      overrides: EMPTY_OVERRIDES,
      createdAt: now(),
      updatedAt: now(),
    };
    await insertCurrentWorkspace({ db, workspace });

    const session: Session = {
      id: 'session_1' as SessionId,
      workspaceId: workspace.id,
      goal: 'refactor auth',
      state: { kind: 'idle', lastActivityAt: now() },
      contextSlots: [],
      providerPreference: DEFAULT_SESSION_PROVIDER_PREFERENCE,
      permissionMode: 'bypassPermissions',
      autoRun: false,
      titleUserEdited: false,
      workflowRuns: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await insertSession(db, session);
    const fetched = await getSessionById(db, session.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.goal).toBe('refactor auth');
    expect(fetched?.state.kind).toBe('idle');
  });

  it('round-trips session providerPreference columns', async () => {
    const db = makeTestDatabase();
    await migrate(db);

    const workspace: Workspace = {
      id: 'ws_3' as WorkspaceId,
      name: 'prov-test',
      slug: 'prov-test',
      sessionsRoot: '/tmp/demo3',
      overrides: EMPTY_OVERRIDES,
      createdAt: now(),
      updatedAt: now(),
    };
    await insertCurrentWorkspace({ db, workspace });

    const session: Session = {
      id: 'session_2' as SessionId,
      workspaceId: workspace.id,
      goal: 'test provider pref',
      state: { kind: 'draft' },
      contextSlots: [],
      providerPreference: { defaultProvider: 'cursor', allowTurnOverride: false },
      permissionMode: 'bypassPermissions',
      autoRun: false,
      titleUserEdited: false,
      workflowRuns: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await insertSession(db, session);
    const fetched = await getSessionById(db, session.id);

    expect(fetched?.providerPreference.defaultProvider).toBe('cursor');
    expect(fetched?.providerPreference.allowTurnOverride).toBe(false);
  });

  it('round-trips workflows with steps and agents', async () => {
    const db = makeTestDatabase();
    await migrate(db);

    const workspace: Workspace = {
      id: 'ws_4' as WorkspaceId,
      name: 'workflow-test',
      slug: 'workflow-test',
      sessionsRoot: '/tmp/demo4',
      overrides: EMPTY_OVERRIDES,
      createdAt: now(),
      updatedAt: now(),
    };
    await insertCurrentWorkspace({ db, workspace });

    const session: Session = {
      id: 'session_3' as SessionId,
      workspaceId: workspace.id,
      goal: 'test workflow',
      state: { kind: 'draft' },
      contextSlots: [],
      providerPreference: DEFAULT_SESSION_PROVIDER_PREFERENCE,
      permissionMode: 'bypassPermissions',
      autoRun: false,
      titleUserEdited: false,
      workflowRuns: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await insertSession(db, session);

    const step1: Step = {
      id: 'step_1' as StepId,
      workflowId: 'wf_1' as WorkflowId,
      ordinal: 0,
      name: 'Discovery',
      promptPrefix: 'Analyze the codebase.',
      providerOverride: 'anthropic',
    };

    const step2: Step = {
      id: 'step_2' as StepId,
      workflowId: 'wf_1' as WorkflowId,
      ordinal: 1,
      name: 'Implementation',
      promptPrefix: 'Implement the solution.',
    };

    const workflow: Workflow = {
      id: 'wf_1' as WorkflowId,
      workspaceId: workspace.id,
      name: 'Workflow',
      description: 'A standard workflow',
      steps: [step1, step2],
      createdAt: now(),
      updatedAt: now(),
    };

    await upsertWorkflow(db, workflow);
    const fetched = await getWorkflow(db, workflow.id);

    expect(fetched).not.toBeNull();
    if (!fetched) {
      throw new Error('fetched should not be null');
    }
    expect(fetched.name).toBe('Workflow');
    expect(fetched.steps).toHaveLength(2);
    expect(fetched.steps[0]!.name).toBe('Discovery');
    expect(fetched.steps[1]!.name).toBe('Implementation');

    const list = await listWorkflows(db, workspace.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.steps).toHaveLength(2);

    const agent: Agent = {
      id: 'agent_1' as AgentId,
      sessionId: session.id,
      stepId: step1.id,
      ordinal: 0,
      name: 'Discovery',
      status: 'pending',
      domains: ['auth', 'db'],
    };

    await db.execute(
      `INSERT INTO agents (
         id, session_id, step_id, ordinal, name, status, domains_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.sessionId,
        agent.stepId ?? null,
        agent.ordinal,
        agent.name,
        agent.status,
        JSON.stringify(agent.domains),
      ],
    );
    const agents = await listAgentsForSession(db, session.id);

    expect(agents).toHaveLength(1);
    if (!agents[0]) {
      throw new Error('agents[0] should exist');
    }
    expect(agents[0].status).toBe('pending');
    expect(agents[0].domains).toEqual(['auth', 'db']);

    await updateAgentStatus(db, agent.id, {
      status: 'completed',
      outputSummary: 'Found issues',
    });
    const updated = await listAgentsForSession(db, session.id);

    if (!updated[0]) {
      throw new Error('updated[0] should exist');
    }
    expect(updated[0].status).toBe('completed');
    expect(updated[0].outputSummary).toBe('Found issues');

    await deleteWorkflow(db, workflow.id);
    const listAfterDelete = await listWorkflows(db, workflow.workspaceId);
    expect(listAfterDelete.find((w) => w.id === workflow.id)).toBeUndefined();
    const deleted = await getWorkflow(db, workflow.id);
    expect(deleted).not.toBeNull();
    expect(deleted?.deletedAt).toBeTruthy();
  });

  it('round-trips session_worktrees: insert, list, delete', async () => {
    const db = makeTestDatabase();
    await migrate(db);

    const workspace: Workspace = {
      id: 'ws_wt' as WorkspaceId,
      name: 'wt-test',
      slug: 'wt-test',
      sessionsRoot: '/tmp/wt-test',
      overrides: EMPTY_OVERRIDES,
      createdAt: now(),
      updatedAt: now(),
    };
    await insertCurrentWorkspace({ db, workspace });

    const session: Session = {
      id: 'session_wt' as SessionId,
      workspaceId: workspace.id,
      goal: 'worktree test',
      state: { kind: 'draft' },
      contextSlots: [],
      providerPreference: DEFAULT_SESSION_PROVIDER_PREFERENCE,
      permissionMode: 'bypassPermissions',
      autoRun: false,
      titleUserEdited: false,
      workflowRuns: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await db.execute(
      `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.id, session.workspaceId, session.goal, session.state.kind, Date.now(), Date.now()],
    );

    await insertSessionWorktree(db, {
      id: 'wt_1',
      sessionId: session.id,
      worktreePath: '/tmp/worktrees/wt_1',
      branch: 'kay/feat-1',
      parallelIndex: 0,
      createdAt: Date.now(),
    });
    await insertSessionWorktree(db, {
      id: 'wt_2',
      sessionId: session.id,
      worktreePath: '/tmp/worktrees/wt_2',
      branch: 'kay/feat-2',
      parallelIndex: 1,
      createdAt: Date.now(),
    });

    const rows = await listWorktreesForSession(db, session.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.worktreePath).toBe('/tmp/worktrees/wt_1');
    expect(rows[0]!.parallelIndex).toBe(0);
    expect(rows[1]!.worktreePath).toBe('/tmp/worktrees/wt_2');
    expect(rows[1]!.parallelIndex).toBe(1);

    await deleteWorktreesForSession(db, session.id);
    const afterDelete = await listWorktreesForSession(db, session.id);
    expect(afterDelete).toHaveLength(0);
  });
});
