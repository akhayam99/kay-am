import { describe, it } from 'vitest';
import type {
  Project,
  ProjectId,
  ProviderRunId,
  Session,
  SessionId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { DEFAULT_SESSION_PROVIDER_PREFERENCE } from '@goodboy/types';
import { migrate } from './migrations/runner';
import { migrations } from './migrations';
import { insertWorkspace } from './queries/workspace';
import { insertProject } from './queries/project';
import { archiveSession, insertSession } from './queries/session';
import { makeTestDatabase } from './test-helpers/test-db';

const shouldSeed = process.env.GOODBOY_QA_SEED === '1';

describe.skipIf(!shouldSeed)('qa seed', () => {
  it('seeds a local db for manual board/list QA', async () => {
    const path = process.env.GOODBOY_QA_DB_PATH;
    if (!path) {
      throw new Error('set GOODBOY_QA_DB_PATH to an empty file path before running this seed');
    }

    const db = makeTestDatabase(path);
    await migrate(db, migrations);

    const now = new Date().toISOString() as Session['createdAt'];
    const workspaceId = 'ws-qa-1' as WorkspaceId;

    const workspace: Workspace = {
      id: workspaceId,
      name: 'QA Sandbox',
      slug: 'qa-sandbox',
      sessionsRoot: '/tmp/goodboy-qa-sandbox',
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
      createdAt: now,
      updatedAt: now,
    };
    const project: Project = {
      id: 'project-qa-1' as ProjectId,
      workspaceId,
      name: 'QA Sandbox',
      rootPath: '/tmp/goodboy-qa-sandbox',
      kind: 'folder',
      baseBranch: null,
      overrides: workspace.overrides,
      createdAt: now,
      updatedAt: now,
    };
    await insertWorkspace({ db, workspace });
    await insertProject({ db, project });

    const baseSession = {
      workspaceId,
      contextSlots: [],
      providerPreference: DEFAULT_SESSION_PROVIDER_PREFERENCE,
      permissionMode: 'default',
      workflowRuns: [],
      autoRun: false,
      titleUserEdited: false,
      createdAt: now,
      updatedAt: now,
    } as const;

    const buildingGoals = ['polish empty states', 'wire up notification bell'];
    const runningGoals = ['migrate lens nav', 'ship drag lasso'];
    const attentionGoals = ['fix flaky snapshot test'];
    const archivedGoals = ['old spike: websocket sync', 'shipped: onboarding wizard'];

    let n = 0;
    const nextId = () => `sess-qa-${(n += 1)}` as SessionId;

    for (const goal of buildingGoals) {
      await insertSession(db, {
        ...baseSession,
        id: nextId(),
        goal,
        state: { kind: 'idle', lastActivityAt: now },
      } as Session);
    }

    for (const goal of runningGoals) {
      await insertSession(db, {
        ...baseSession,
        id: nextId(),
        goal,
        state: { kind: 'running', runId: `run-${nextId()}` as ProviderRunId, startedAt: now },
      } as Session);
    }

    for (const goal of attentionGoals) {
      await insertSession(db, {
        ...baseSession,
        id: nextId(),
        goal,
        state: { kind: 'error', message: 'agent crashed', failedAt: now },
      } as Session);
    }

    for (const goal of archivedGoals) {
      const id = nextId();
      await insertSession(db, {
        ...baseSession,
        id,
        goal,
        state: { kind: 'idle', lastActivityAt: now },
      } as Session);
      await archiveSession(db, id);
    }
  });
});
