import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@goodboy/db';
import type { MountId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  db: null as unknown as {
    exec: (sql: string) => Promise<void>;
    execute: (sql: string, params?: ReadonlyArray<unknown>) => Promise<{ rowsAffected: number }>;
    select: <T>(sql: string, params?: ReadonlyArray<unknown>) => Promise<ReadonlyArray<T>>;
  },
  branchNames: ['ak/base'] as Array<string>,
  createWorktree: vi.fn(),
  inspectWorktree: vi.fn(async () => ({ kind: 'registered' }) as { kind: string }),
}));

vi.mock('@goodboy/ui', () => ({ formatError: (error: unknown) => String(error) }));

vi.mock('../features/settings/settings', () => ({ DEFAULT_BRANCH_PREFIX: 'ak' }));

vi.mock('../shared/lib/db', () => ({
  tauriDatabase: {
    exec: (sql: string) => h.db.exec(sql),
    execute: (sql: string, params?: ReadonlyArray<unknown>) => h.db.execute(sql, params),
    select: <T>(sql: string, params?: ReadonlyArray<unknown>) => h.db.select<T>(sql, params),
  },
}));

vi.mock('../features/worktree/worktree', () => ({
  createWorktree: h.createWorktree,
  changeWorktreeBranch: vi.fn(async () => undefined),
  invalidateLocalBranchesCache: vi.fn(),
  listBranchNames: vi.fn(async () => h.branchNames),
  inspectWorktree: h.inspectWorktree,
  removeWorktreeChecked: vi.fn(async () => ({ kind: 'removed', path: '' })),
  worktreeWriterStatus: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  removeWorktree: vi.fn(async () => undefined),
  removeSessionDirectory: vi.fn(async () => undefined),
  sessionDirExists: vi.fn(async () => true),
  worktreeStatus: vi.fn(async () => ({
    workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
    inProgress: null,
  })),
}));

import { insertSessionMount, listMountOperations, listSessionMounts } from '@goodboy/db';
import { createProjectMountsSlice } from '../store/slices/project-mounts/index';
import {
  createMountRecoveryDatabase,
  mountRecoveryFixture,
  RECOVERY_PROJECT_ID,
  RECOVERY_SESSION_ID,
  RECOVERY_WORKSPACE_ID,
} from './helpers/mountRecoveryDatabase';

type State = Record<string, unknown>;

const makeSlice = () => {
  const state: State = {
    sessions: [
      {
        id: RECOVERY_SESSION_ID,
        workspaceId: RECOVERY_WORKSPACE_ID,
        goal: 'Split the big pull request',
        providerPreference: { defaultProvider: 'claude' },
      },
    ],
    archivedSessions: {},
    projects: [
      {
        id: RECOVERY_PROJECT_ID,
        workspaceId: RECOVERY_WORKSPACE_ID,
        kind: 'repo',
        name: 'API',
        rootPath: '/repo/api',
        baseBranch: 'main',
        overrides: {},
      },
    ],
    workspaceOverrides: {},
    sessionExternalTasks: {},
    sessionProjectMounts: {},
    sessionMounts: {},
    mountBranchObservations: {},
    sessionWorktrees: {},
    sessionBranches: {},
    sessionActiveProject: {},
    sessionActiveMount: {},
    sessionGithub: {},
    sessionProjectPrs: {},
    sessionSelectedPrNumber: {},
    terminalTabs: {},
    recordSessionEvent: vi.fn(async () => undefined),
    reconcileOrphanWorktrees: vi.fn(async () => undefined),
  };
  const set = vi.fn((updater: Partial<State> | ((current: State) => Partial<State>)) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    Object.assign(state, patch);
  });
  return { state, slice: createProjectMountsSlice(set as never, (() => state) as never) };
};

let db: Database;

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createMountRecoveryDatabase();
  h.db = db as never;
  h.branchNames = ['ak/base'];
  h.inspectWorktree.mockResolvedValue({ kind: 'registered' });
  h.createWorktree.mockImplementation(
    async (args: {
      branchPrefix: string;
      slug: string;
      parentDir: string;
      dirName: string;
      existingBranch?: string;
    }) => ({
      worktreePath: `${args.parentDir}/${args.dirName}`,
      branchName: args.existingBranch ?? `${args.branchPrefix}/${args.slug}`,
      slug: args.slug,
      reused: false,
    }),
  );
});

const journal = async () => listMountOperations({ db, sessionId: RECOVERY_SESSION_ID });

describe('mount operations against a real database', () => {
  it('forks a new mount without claiming a mount id the journal cannot see yet', async () => {
    const { slice } = makeSlice();

    const mount = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/first',
    });

    const rows = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    const operations = await journal();
    expect(rows.map((row) => row.id)).toEqual([mount.id]);
    expect(operations).toHaveLength(1);
    expect(operations[0]?.status).toBe('succeeded');
    expect(operations[0]?.mountId).toBe(mount.id);
  });

  it('forks two branches of one project into two mounts', async () => {
    const { slice } = makeSlice();

    const first = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/first',
    });
    const second = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/second',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.branch).toBe('ak/second');
    expect(second.worktreePath).not.toBe(first.worktreePath);
    const rows = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    expect(rows).toHaveLength(2);
  });

  it('replays one request id into the same mount without cutting a second worktree', async () => {
    const { slice } = makeSlice();

    const first = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/first',
      requestId: 'request-1',
    });
    const replayed = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/first',
      requestId: 'request-1',
    });

    expect(replayed.id).toBe(first.id);
    expect(h.createWorktree).toHaveBeenCalledTimes(1);
    const rows = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    expect(rows).toHaveLength(1);
  });

  it('never replays a settled request onto a fork of another branch', async () => {
    const { slice } = makeSlice();

    const first = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/first',
      requestId: 'request-1',
    });
    const second = await slice.forkMount({
      sessionId: RECOVERY_SESSION_ID,
      projectId: RECOVERY_PROJECT_ID,
      branch: 'ak/second',
      requestId: 'request-1',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.branch).toBe('ak/second');
    expect(h.createWorktree).toHaveBeenCalledTimes(2);
  });

  it('journals an attach against the mount row it already has', async () => {
    const mount = mountRecoveryFixture({
      id: 'mount-detached',
      branch: 'ak/base',
      position: 1,
      path: null,
      isAttached: false,
      diskState: 'removed',
    });
    await insertSessionMount({
      db,
      mount: { ...mount, lastWorktreePath: '/repo/api/.goodboy/worktrees/mount-detached' },
    });
    const { slice } = makeSlice();

    const attached = await slice.attachMount({
      sessionId: RECOVERY_SESSION_ID,
      mountId: 'mount-detached' as MountId,
      requestId: 'attach-1',
    });

    expect(attached.isAttached).toBe(true);
    const operations = await journal();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.mountId).toBe('mount-detached');
    expect(operations[0]?.status).toBe('succeeded');
  });

  it('keeps the journal honest when the fork is refused before any mount exists', async () => {
    h.createWorktree.mockRejectedValueOnce(new Error('git worktree add failed'));
    const { slice } = makeSlice();

    await expect(
      slice.forkMount({
        sessionId: RECOVERY_SESSION_ID,
        projectId: RECOVERY_PROJECT_ID,
        branch: 'ak/first',
      }),
    ).rejects.toThrow('git worktree add failed');

    const operations = await journal();
    expect(operations[0]?.status).toBe('failed');
    expect(operations[0]?.mountId).toBeNull();
    const rows = await listSessionMounts({ db, sessionId: RECOVERY_SESSION_ID });
    expect(rows).toHaveLength(0);
  });
});
