import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listMountPathOwnership,
  listAllRetainedWorktreePaths,
  listUnsettledMountOperations,
  detachSessionMounts,
  deleteRetainedWorktreePath,
  markRetainedWorktreePathChecked,
  scanOrphanWorktrees,
  worktreeDirectorySize,
} = vi.hoisted(() => ({
  listMountPathOwnership: vi.fn(async () => [
    {
      mountId: 'mount-live',
      sessionId: 'sess-live',
      workspaceId: 'ws-1',
      projectId: 'project-1',
      worktreePath: '/repo/.goodboy/worktrees/gb-live',
      branch: 'ak/live',
      revision: 0,
      isSessionDeleted: false,
      isSessionArchived: false,
    },
  ]),
  listAllRetainedWorktreePaths: vi.fn(
    async (): Promise<ReadonlyArray<Record<string, unknown>>> => [],
  ),
  listUnsettledMountOperations: vi.fn(
    async (): Promise<ReadonlyArray<Record<string, unknown>>> => [],
  ),
  detachSessionMounts: vi.fn(
    async (_params: {
      sessionId: string;
      detached: ReadonlyArray<Record<string, unknown>>;
      retained: ReadonlyArray<Record<string, unknown>>;
    }): Promise<void> => undefined,
  ),
  deleteRetainedWorktreePath: vi.fn(async () => undefined),
  markRetainedWorktreePathChecked: vi.fn(async () => undefined),
  scanOrphanWorktrees: vi.fn(
    async (_params: { repoPath: string; knownPaths: ReadonlyArray<string> }) => [
      {
        path: '/repo/.goodboy/worktrees/gb-ghost',
        name: 'gb-ghost',
        sizeBytes: 4096,
        isRegistered: false,
      },
    ],
  ),
  worktreeDirectorySize: vi.fn(async ({ path }: { path: string }) => ({
    path,
    sizeBytes: 2048 as number | null,
    isPartial: false,
    exists: true,
  })),
}));

vi.mock('@goodboy/db', () => ({
  listMountPathOwnership,
  listAllRetainedWorktreePaths,
  listUnsettledMountOperations,
  detachSessionMounts,
  deleteRetainedWorktreePath,
  markRetainedWorktreePathChecked,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  scanOrphanWorktrees,
  worktreeDirectorySize,
}));

import { reconcileOrphanWorktrees } from './reconcileOrphanWorktrees';

const emitNotification = vi.fn(async () => undefined);

const makeStore = (kind: string) => ({
  projects: [{ id: 'project-1', workspaceId: 'ws-1', name: 'demo', rootPath: '/repo', kind }],
  orphanWorktrees: {},
  retainedWorktreePaths: {},
  emitNotification,
});

type Store = ReturnType<typeof makeStore>;

const run = async (store: Store) => {
  const set = vi.fn((updater: unknown) => {
    const patch =
      typeof updater === 'function' ? (updater as (s: Store) => object)(store) : updater;
    Object.assign(store, patch);
  });
  await reconcileOrphanWorktrees(set as never, (() => store) as never)();
};

beforeEach(() => {
  vi.clearAllMocks();
  listAllRetainedWorktreePaths.mockResolvedValue([]);
  listUnsettledMountOperations.mockResolvedValue([]);
  listMountPathOwnership.mockResolvedValue([
    {
      mountId: 'mount-live',
      sessionId: 'sess-live',
      workspaceId: 'ws-1',
      projectId: 'project-1',
      worktreePath: '/repo/.goodboy/worktrees/gb-live',
      branch: 'ak/live',
      revision: 0,
      isSessionDeleted: false,
      isSessionArchived: false,
    },
  ]);
});

describe('reconciling the worktrees folder', () => {
  it('reports a folder git forgot, and never counts one a session still owns', async () => {
    const store = makeStore('repo');

    await run(store);

    expect(scanOrphanWorktrees).toHaveBeenCalledWith({
      repoPath: '/repo',
      knownPaths: ['/repo/.goodboy/worktrees/gb-live'],
    });
    expect(store.orphanWorktrees).toEqual({
      'ws-1': [
        {
          path: '/repo/.goodboy/worktrees/gb-ghost',
          name: 'gb-ghost',
          sizeBytes: 4096,
          isRegistered: false,
        },
      ],
    });
  });

  it('offers the cleanup instead of running it', async () => {
    const store = makeStore('repo');

    await run(store);

    expect(emitNotification).toHaveBeenCalledWith(
      'orphan-worktrees',
      'info',
      expect.stringContaining('1 session folders left on disk'),
      expect.any(String),
      { workspaceId: 'ws-1', action: { kind: 'open-orphan-worktrees', workspaceId: 'ws-1' } },
    );
  });

  it('announces the same orphan set only once across repeated scans', async () => {
    const store = makeStore('repo');

    await run(store);
    await run(store);

    expect(emitNotification).toHaveBeenCalledTimes(1);
  });

  it('transfers a real folder of a deleted session to retained ownership', async () => {
    listMountPathOwnership.mockResolvedValue([
      {
        mountId: 'mount-gone',
        sessionId: 'sess-gone',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        worktreePath: '/repo/.goodboy/worktrees/gb-gone',
        branch: 'ak/gone',
        revision: 3,
        isSessionDeleted: true,
        isSessionArchived: false,
      },
    ]);
    const store = makeStore('repo');

    await run(store);

    const call = detachSessionMounts.mock.calls[0]?.[0];
    expect(call?.sessionId).toBe('sess-gone');
    expect(call?.detached).toEqual([{ mountId: 'mount-gone', diskState: 'present' }]);
    expect(call?.retained).toEqual([
      expect.objectContaining({
        worktreePath: '/repo/.goodboy/worktrees/gb-gone',
        reason: 'session_delete',
        repoRoot: '/repo',
      }),
    ]);
    expect(scanOrphanWorktrees).toHaveBeenCalledWith({
      repoPath: '/repo',
      knownPaths: ['/repo/.goodboy/worktrees/gb-gone'],
    });
  });

  it('releases the path of a deleted session when the folder is gone', async () => {
    listMountPathOwnership.mockResolvedValue([
      {
        mountId: 'mount-gone',
        sessionId: 'sess-gone',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        worktreePath: '/repo/.goodboy/worktrees/gb-gone',
        branch: 'ak/gone',
        revision: 3,
        isSessionDeleted: true,
        isSessionArchived: false,
      },
    ]);
    worktreeDirectorySize.mockResolvedValue({
      path: '/repo/.goodboy/worktrees/gb-gone',
      sizeBytes: null,
      isPartial: false,
      exists: false,
    });
    const store = makeStore('repo');

    await run(store);

    expect(detachSessionMounts).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-gone',
        detached: [{ mountId: 'mount-gone', diskState: 'removed' }],
        retained: [],
      }),
    );
    expect(scanOrphanWorktrees).toHaveBeenCalledWith({ repoPath: '/repo', knownPaths: [] });
  });

  it('keeps a retained path it cannot read and clears one that is gone', async () => {
    listAllRetainedWorktreePaths.mockResolvedValue([
      {
        id: 'retained-unknown',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        sourceSessionId: 'sess-old',
        sourceMountId: 'mount-old',
        repoRoot: '/repo',
        worktreePath: '/repo/.goodboy/worktrees/gb-unreadable',
        branch: 'ak/old',
        reason: 'session_delete',
        lastCheckedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'retained-gone',
        workspaceId: 'ws-1',
        projectId: 'project-1',
        sourceSessionId: 'sess-old',
        sourceMountId: 'mount-older',
        repoRoot: '/repo',
        worktreePath: '/repo/.goodboy/worktrees/gb-vanished',
        branch: 'ak/older',
        reason: 'session_delete',
        lastCheckedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    worktreeDirectorySize.mockImplementation(async ({ path }: { path: string }) => ({
      path,
      sizeBytes: null,
      isPartial: path.endsWith('gb-unreadable'),
      exists: path.endsWith('gb-unreadable'),
    }));
    const store = makeStore('repo');

    await run(store);

    expect(deleteRetainedWorktreePath).toHaveBeenCalledWith({ db: {}, id: 'retained-gone' });
    expect(markRetainedWorktreePathChecked).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'retained-unknown' }),
    );
    expect(scanOrphanWorktrees.mock.calls[0]?.[0]).toMatchObject({
      knownPaths: expect.arrayContaining(['/repo/.goodboy/worktrees/gb-unreadable']),
    });
  });

  it('leaves a folder-backed workspace alone', async () => {
    const store = makeStore('folder');
    const set = vi.fn();

    await reconcileOrphanWorktrees(set as never, (() => store) as never)();

    expect(scanOrphanWorktrees).not.toHaveBeenCalled();
  });
});
