import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';

type Row = {
  id: string;
  sessionId: string;
  projectId: string | null;
  worktreePath: string | null;
  lastWorktreePath: string | null;
  branch: string;
  baseBranch: string | null;
  parallelIndex: number;
  mountName: string | null;
  repoSlug: string | null;
  isAttached: boolean;
  diskState: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

const h = vi.hoisted(() => {
  const rows = new Map<string, Row>();
  const operations = new Map<string, Record<string, unknown>>();
  return {
    rows,
    operations,
    branchNames: ['ak/base'] as Array<string>,
    createWorktree: vi.fn(),
    changeWorktreeBranch: vi.fn(async () => undefined),
    listBranchNames: vi.fn(async () => h.branchNames),
    inspectWorktree: vi.fn(async () => ({ kind: 'registered' }) as { kind: string }),
    removeWorktreeChecked: vi.fn(
      async () =>
        ({ kind: 'removed', path: '' }) as {
          kind: string;
          path: string;
          reasons?: ReadonlyArray<string>;
        },
    ),
    sessionDirExists: vi.fn(async () => true),
    worktreeStatus: vi.fn(
      async () =>
        ({
          workingTree: {
            kind: 'known',
            staged: 0,
            unstaged: 0,
            untracked: 0,
            unmerged: 0,
            changed: 0,
          },
          inProgress: null,
        }) as {
          workingTree: Record<string, unknown>;
          inProgress: string | null;
        },
    ),
  };
});

vi.mock('@goodboy/ui', () => ({ formatError: (error: unknown) => String(error) }));

vi.mock('../../../features/settings/settings', () => ({ DEFAULT_BRANCH_PREFIX: 'ak' }));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('../../../features/worktree/worktree', () => ({
  createWorktree: h.createWorktree,
  changeWorktreeBranch: h.changeWorktreeBranch,
  invalidateLocalBranchesCache: vi.fn(),
  listBranchNames: h.listBranchNames,
  inspectWorktree: h.inspectWorktree,
  removeWorktreeChecked: h.removeWorktreeChecked,
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
  sessionDirExists: h.sessionDirExists,
  worktreeStatus: h.worktreeStatus,
}));

vi.mock('@goodboy/db', () => ({
  listSessionMounts: vi.fn(async ({ sessionId }: { sessionId: string }) =>
    [...h.rows.values()].filter((row) => row.sessionId === sessionId),
  ),
  insertSessionMount: vi.fn(async ({ mount }: { mount: Row }) => {
    const owned = [...h.rows.values()].some(
      (row) => row.worktreePath !== null && row.worktreePath === mount.worktreePath,
    );
    if (owned) {
      throw new Error('worktreePath already owned');
    }
    h.rows.set(mount.id, { ...mount });
  }),
  updateSessionMountBranch: vi.fn(
    async ({
      mountId,
      branch,
      expectedRevision,
    }: {
      mountId: string;
      branch: string;
      expectedRevision: number;
    }) => {
      const row = h.rows.get(mountId);
      if (row === undefined || row.revision !== expectedRevision) {
        return false;
      }
      h.rows.set(mountId, { ...row, branch, revision: row.revision + 1 });
      return true;
    },
  ),
  updateSessionMountLifecycle: vi.fn(
    async ({
      mountId,
      worktreePath,
      isAttached,
      diskState,
      expectedRevision,
    }: {
      mountId: string;
      worktreePath: string | null;
      isAttached: boolean;
      diskState: string;
      expectedRevision: number;
    }) => {
      const row = h.rows.get(mountId);
      if (row === undefined || row.revision !== expectedRevision) {
        return false;
      }
      h.rows.set(mountId, {
        ...row,
        worktreePath,
        lastWorktreePath: worktreePath ?? row.worktreePath ?? row.lastWorktreePath,
        isAttached,
        diskState,
        revision: row.revision + 1,
      });
      return true;
    },
  ),
  getMountOperation: vi.fn(
    async ({ sessionId, requestId }: { sessionId: string; requestId: string }) =>
      h.operations.get(`${sessionId}:${requestId}`) ?? null,
  ),
  upsertMountOperation: vi.fn(async ({ operation }: { operation: Record<string, unknown> }) => {
    const mountId = operation['mountId'];
    if (typeof mountId === 'string' && !h.rows.has(mountId)) {
      throw new Error('Sqlite error: FOREIGN KEY constraint failed');
    }
    h.operations.set(`${operation['sessionId']}:${operation['requestId']}`, { ...operation });
  }),
  listMountOperations: vi.fn(async ({ sessionId }: { sessionId: string }) =>
    [...h.operations.values()].filter((operation) => operation['sessionId'] === sessionId),
  ),
  updateSessionActiveMount: vi.fn(async () => true),
  updateSessionActiveProject: vi.fn(async () => undefined),
  deleteSessionWorktreeForProject: vi.fn(async () => undefined),
}));

import { createProjectMountsSlice } from './index';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const REPO_ROOT = '/repos/goodboy';

type State = Record<string, unknown>;

const makeState = (): State => ({
  sessions: [
    {
      id: SESSION_ID,
      workspaceId: 'workspace-1',
      goal: 'Split the big pull request',
      providerPreference: { defaultProvider: 'claude' },
    },
  ],
  archivedSessions: {},
  projects: [
    {
      id: PROJECT_ID,
      workspaceId: 'workspace-1',
      kind: 'repo',
      name: 'goodboy',
      rootPath: REPO_ROOT,
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
  sessionGithub: {},
  sessionProjectPrs: {},
  sessionSelectedPrNumber: {},
  terminalTabs: {},
  recordSessionEvent: vi.fn(async () => undefined),
  reconcileOrphanWorktrees: vi.fn(async () => undefined),
});

const makeSlice = () => {
  const state = makeState();
  const set = vi.fn((updater: Partial<State> | ((current: State) => Partial<State>)) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    Object.assign(state, patch);
  });
  const slice = createProjectMountsSlice(set as never, (() => state) as never);
  return { state, slice };
};

const seedMount = ({
  id,
  branch,
  worktreePath,
  revision = 0,
}: {
  id: string;
  branch: string;
  worktreePath: string | null;
  revision?: number;
}): void => {
  h.rows.set(id, {
    id,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    worktreePath,
    lastWorktreePath: worktreePath,
    branch,
    baseBranch: 'main',
    parallelIndex: 1,
    mountName: 'goodboy',
    repoSlug: null,
    isAttached: worktreePath !== null,
    diskState: worktreePath === null ? 'removed' : 'present',
    revision,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  h.operations.clear();
  h.branchNames = ['ak/base'];
  h.removeWorktreeChecked.mockResolvedValue({ kind: 'removed', path: '' });
  h.inspectWorktree.mockResolvedValue({ kind: 'registered' });
  h.sessionDirExists.mockResolvedValue(true);
  h.worktreeStatus.mockResolvedValue({
    workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
    inProgress: null,
  });
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

describe('project mount lifecycle', () => {
  it('forks the same project twice into two mounts with distinct paths and branches', async () => {
    const { slice, state } = makeSlice();

    const first = await slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID });
    const second = await slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID });

    expect(second.id).not.toBe(first.id);
    expect(second.worktreePath).not.toBe(first.worktreePath);
    expect(second.branch).not.toBe(first.branch);
    expect(state.sessionProjectMounts).toEqual({
      [SESSION_ID]: [
        expect.objectContaining({ mountId: first.id }),
        expect.objectContaining({ mountId: second.id }),
      ],
    });
  });

  it('names every forked directory after the full mount id', async () => {
    const { slice } = makeSlice();

    const mount = await slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID });

    expect(mount.worktreePath).toContain(mount.id);
  });

  it('returns the recorded mount when the same request id is retried', async () => {
    const { slice } = makeSlice();

    const first = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      requestId: 'request-1',
    });
    const retried = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      requestId: 'request-1',
    });

    expect(retried.id).toBe(first.id);
    expect(h.createWorktree).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent forks of the same project', async () => {
    const { slice } = makeSlice();

    const [first, second] = await Promise.all([
      slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID }),
      slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID }),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.worktreePath).not.toBe(second.worktreePath);
    expect(h.rows.size).toBe(2);
  });

  it('ignores a recorded result that belongs to another repository', async () => {
    const { slice } = makeSlice();
    h.operations.set(`${SESSION_ID}:request-2`, {
      id: 'operation-1',
      sessionId: SESSION_ID,
      mountId: null,
      requestId: 'request-2',
      kind: 'fork',
      status: 'succeeded',
      expectedRevision: 0,
      input: {},
      result: {
        mountId: 'other-mount',
        worktreePath: '/elsewhere/api',
        branch: 'ak/other',
        repoRoot: '/repos/other',
      },
      errorCode: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const mount = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      requestId: 'request-2',
    });

    expect(mount.worktreePath).toContain(REPO_ROOT);
    expect(h.createWorktree).toHaveBeenCalledTimes(1);
  });

  it('refuses a fork onto a branch that already exists', async () => {
    const { slice } = makeSlice();
    h.branchNames = ['ak/base', 'ak/taken'];

    await expect(
      slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID, branch: 'ak/taken' }),
    ).rejects.toMatchObject({ code: 'branch-taken' });
    expect(h.createWorktree).not.toHaveBeenCalled();
  });

  it('keeps the created directory when the mount row cannot be written', async () => {
    const { slice } = makeSlice();
    const collidingPath = `${REPO_ROOT}/.goodboy/worktrees/foreign`;
    h.rows.set('mount-foreign', {
      id: 'mount-foreign',
      sessionId: 'session-elsewhere',
      projectId: PROJECT_ID,
      worktreePath: collidingPath,
      lastWorktreePath: collidingPath,
      branch: 'ak/foreign',
      baseBranch: 'main',
      parallelIndex: 1,
      mountName: 'goodboy',
      repoSlug: null,
      isAttached: true,
      diskState: 'present',
      revision: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    h.createWorktree.mockResolvedValue({
      worktreePath: collidingPath,
      branchName: 'ak/second',
      slug: 'second',
      reused: false,
    });

    await expect(
      slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID, requestId: 'request-4' }),
    ).rejects.toMatchObject({ code: 'directory-occupied' });
    expect(h.operations.get(`${SESSION_ID}:request-4`)).toMatchObject({ status: 'uncertain' });
  });

  it('refuses a fork that lands in the directory of another mount of this session', async () => {
    const { slice } = makeSlice();
    const first = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      requestId: 'request-3',
    });
    h.createWorktree.mockResolvedValue({
      worktreePath: first.worktreePath,
      branchName: 'ak/second',
      slug: 'second',
      reused: true,
    });

    await expect(
      slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID, requestId: 'request-4' }),
    ).rejects.toMatchObject({ code: 'directory-occupied' });
    expect(h.operations.get(`${SESSION_ID}:request-4`)).toMatchObject({ status: 'failed' });
    expect([...h.rows.values()]).toHaveLength(1);
  });

  it('forks a different branch under a reused request id instead of replaying it', async () => {
    const { slice } = makeSlice();

    const first = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      branch: 'ak/first',
      requestId: 'request-5',
    });
    const second = await slice.forkMount({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
      branch: 'ak/second',
      requestId: 'request-5',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.branch).toBe('ak/second');
  });

  it('stamps the journal with the mount id only once the mount row exists', async () => {
    const { slice } = makeSlice();

    const mount = await slice.forkMount({ sessionId: SESSION_ID, projectId: PROJECT_ID });

    const operation = [...h.operations.values()][0];
    expect(operation).toMatchObject({ status: 'succeeded', mountId: mount.id });
    expect(h.rows.get(mount.id)).toBeDefined();
  });

  it('switches a mount in place and keeps its identity and directory', async () => {
    const { slice } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });

    const switched = await slice.switchMount({
      sessionId: SESSION_ID,
      mountId: 'mount-1' as MountId,
      branch: 'ak/second',
    });

    expect(switched.id).toBe('mount-1');
    expect(switched.worktreePath).toBe(`${REPO_ROOT}/wt/first`);
    expect(switched.branch).toBe('ak/second');
    expect(switched.revision).toBe(1);
  });

  it('refuses a switch while the head of the mount is unresolved', async () => {
    const { slice, state } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });
    state.mountBranchObservations = {
      [SESSION_ID]: [
        {
          mountId: 'mount-1' as MountId,
          sessionId: SESSION_ID,
          state: 'detached',
          recordedBranch: 'ak/first',
          observedBranch: null,
          revision: 0,
          observedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    await expect(
      slice.switchMount({
        sessionId: SESSION_ID,
        mountId: 'mount-1' as MountId,
        branch: 'ak/second',
      }),
    ).rejects.toMatchObject({ code: 'branch-mismatch' });
    expect(h.changeWorktreeBranch).not.toHaveBeenCalled();
  });

  it('keeps the row and the directory when a dirty mount is unmounted', async () => {
    const { slice } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });
    h.removeWorktreeChecked.mockResolvedValue({
      kind: 'kept',
      path: `${REPO_ROOT}/wt/first`,
      reasons: ['unstaged-changes'],
    });

    const result = await slice.unmountMount({
      sessionId: SESSION_ID,
      mountId: 'mount-1' as MountId,
    });

    expect(result.kept).toBe(true);
    expect(result.reason).toBe('unstaged-changes');
    expect(h.rows.get('mount-1')).toMatchObject({
      worktreePath: `${REPO_ROOT}/wt/first`,
      isAttached: false,
    });
  });

  it('clears the path of a removed mount and drops it from the writable set', async () => {
    const { slice, state } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });

    await slice.unmountMount({ sessionId: SESSION_ID, mountId: 'mount-1' as MountId });

    expect(h.rows.get('mount-1')).toMatchObject({
      worktreePath: null,
      lastWorktreePath: `${REPO_ROOT}/wt/first`,
      diskState: 'removed',
    });
    expect(state.sessionProjectMounts).toEqual({ [SESSION_ID]: [] });
  });

  it('recreates a removed worktree from its own branch when attaching', async () => {
    const { slice } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: null, revision: 2 });
    h.branchNames = ['ak/base', 'ak/first'];
    h.inspectWorktree.mockResolvedValue({ kind: 'missing' });

    const attached = await slice.attachMount({
      sessionId: SESSION_ID,
      mountId: 'mount-1' as MountId,
    });

    expect(attached.worktreePath).toContain('mount-1');
    expect(attached.isAttached).toBe(true);
    expect(h.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ existingBranch: 'ak/first' }),
    );
  });

  it('refuses to attach a mount whose branch is gone', async () => {
    const { slice } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: null, revision: 2 });
    h.branchNames = ['ak/base'];
    h.inspectWorktree.mockResolvedValue({ kind: 'missing' });

    await expect(
      slice.attachMount({ sessionId: SESSION_ID, mountId: 'mount-1' as MountId }),
    ).rejects.toMatchObject({ code: 'branch-missing' });
    expect(h.createWorktree).not.toHaveBeenCalled();
  });
});

describe('branch mismatch recovery', () => {
  const observedMismatch = (state: State): void => {
    state['mountBranchObservations'] = {
      [SESSION_ID]: [
        {
          mountId: 'mount-1' as MountId,
          sessionId: SESSION_ID,
          state: 'mismatch',
          recordedBranch: 'ak/first',
          observedBranch: 'ak/drifted',
          revision: 0,
          observedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
  };

  it('adopts the observed branch on the mount that already holds the directory', async () => {
    const { slice, state } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });
    observedMismatch(state);

    const resolved = await slice.resolveMountBranchMismatch({
      sessionId: SESSION_ID,
      mountId: 'mount-1' as MountId,
      resolution: 'adopt-observed',
    });

    expect(resolved.branch).toBe('ak/drifted');
    expect(resolved.worktreePath).toBe(`${REPO_ROOT}/wt/first`);
    expect(h.rows.size).toBe(1);
  });

  it('keeps both branches by recreating the recorded one in its own directory', async () => {
    const { slice, state } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });
    observedMismatch(state);

    await slice.resolveMountBranchMismatch({
      sessionId: SESSION_ID,
      mountId: 'mount-1' as MountId,
      resolution: 'keep-both',
    });

    const branches = [...h.rows.values()].map((row) => row.branch).sort();
    expect(branches).toEqual(['ak/drifted', 'ak/first']);
    expect(h.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ existingBranch: 'ak/first' }),
    );
  });

  it('refuses to repair a worktree with a git operation in flight', async () => {
    const { slice, state } = makeSlice();
    seedMount({ id: 'mount-1', branch: 'ak/first', worktreePath: `${REPO_ROOT}/wt/first` });
    observedMismatch(state);
    h.worktreeStatus.mockResolvedValue({
      workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 2, changed: 2 },
      inProgress: 'rebase',
    });

    await expect(
      slice.resolveMountBranchMismatch({
        sessionId: SESSION_ID,
        mountId: 'mount-1' as MountId,
        resolution: 'keep-both',
      }),
    ).rejects.toMatchObject({ code: 'directory-busy' });
    expect(h.changeWorktreeBranch).not.toHaveBeenCalled();
  });
});
