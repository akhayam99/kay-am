import { beforeEach, describe, expect, it, vi } from 'vitest';

const order: Array<string> = [];

const {
  removeWorktreeChecked,
  worktreeWriterStatus,
  listSessionMounts,
  purgeSessionForDelete,
  purgeSessionMounts,
  cancelTurn,
  listLiveRunIds,
} = vi.hoisted(() => ({
  removeWorktreeChecked: vi.fn(
    async ({ worktreePath }: { worktreePath: string }) =>
      ({ kind: 'removed', path: worktreePath }) as {
        kind: string;
        path: string;
        reasons?: ReadonlyArray<string>;
      },
  ),
  worktreeWriterStatus: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  listSessionMounts: vi.fn(async () => [
    {
      id: 'mount-1',
      sessionId: 'sess-1',
      projectId: 'project-1',
      worktreePath: '/repo/.goodboy/worktrees/gb-ghost',
      lastWorktreePath: '/repo/.goodboy/worktrees/gb-ghost',
      branch: 'gb/ghost',
      baseBranch: null,
      parallelIndex: 0,
      mountName: 'repo',
      repoSlug: null,
      isAttached: true,
      diskState: 'present',
      revision: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]),
  purgeSessionForDelete: vi.fn(async () => undefined),
  purgeSessionMounts: vi.fn(
    async (_params: {
      sessionId: string;
      retained: ReadonlyArray<Record<string, unknown>>;
    }): Promise<void> => undefined,
  ),
  cancelTurn: vi.fn(async () => undefined),
  listLiveRunIds: vi.fn(async () => new Set<string>()),
}));

vi.mock('@goodboy/db', () => ({
  listSessionMounts,
  purgeSessionForDelete,
  purgeSessionMounts,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  removeWorktreeChecked,
  worktreeWriterStatus,
  removeSessionDirectory: vi.fn(async () => undefined),
  tidyRepoGoodboyDir: vi.fn(async () => undefined),
  scratchDirRemove: vi.fn(async () => undefined),
}));
vi.mock('../../../features/chat/turn', () => ({ cancelTurn, listLiveRunIds }));

import { deleteTask } from './deleteTask';

const SESSION_ID = 'sess-1' as never;

const makeStore = (state: { kind: string; runId?: string } = { kind: 'idle' }) => ({
  sessions: [{ id: 'sess-1', workspaceId: 'ws-1', goal: 'ship it', state }],
  archivedSessions: {},
  workspaces: [{ id: 'ws-1', sessionsRoot: '/repo' }],
  projects: [
    { id: 'project-1', workspaceId: 'ws-1', rootPath: '/repo', kind: 'repo', name: 'repo' },
  ],
  terminalTabs: {},
  sessionBranches: { 'sess-1': 'gb/ghost' },
  sessionPhaseRuns: {},
  closeSessionTerminals: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push('terminals closed');
  }),
  evictSession: vi.fn(),
  emitNotification: vi.fn(async () => undefined),
  reconcileOrphanWorktrees: vi.fn(async () => undefined),
});

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  listLiveRunIds.mockResolvedValue(new Set<string>());
  removeWorktreeChecked.mockImplementation(async ({ worktreePath }: { worktreePath: string }) => {
    order.push('worktree removed');
    return { kind: 'removed', path: worktreePath };
  });
});

describe('deleting a session', () => {
  it('waits for the terminals to die before touching the folder', async () => {
    const store = makeStore();

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(order).toEqual(['terminals closed', 'worktree removed']);
    expect(purgeSessionMounts).toHaveBeenCalledWith({
      db: {},
      sessionId: SESSION_ID,
      retained: [],
    });
    expect(purgeSessionForDelete).toHaveBeenCalledWith({ db: {}, id: SESSION_ID });
  });

  it('retains the directory it could not remove and reports it', async () => {
    const store = makeStore();
    removeWorktreeChecked.mockResolvedValue({
      kind: 'kept',
      path: '/repo/.goodboy/worktrees/gb-ghost',
      reasons: ['untracked-files'],
    });

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    const call = purgeSessionMounts.mock.calls[0]?.[0];
    expect(call?.retained).toEqual([
      expect.objectContaining({
        worktreePath: '/repo/.goodboy/worktrees/gb-ghost',
        branch: 'gb/ghost',
        reason: 'session_delete',
      }),
    ]);
    expect(store.emitNotification).toHaveBeenCalledWith(
      'error',
      'warning',
      'failed to remove 1 session paths',
      expect.stringContaining('untracked-files'),
      expect.anything(),
    );
  });

  it('never removes a directory when the running agent refuses to stop', async () => {
    const store = makeStore({ kind: 'running', runId: 'run-1' });
    listLiveRunIds.mockResolvedValue(new Set(['run-1']));

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(cancelTurn).toHaveBeenCalledWith('run-1');
    expect(removeWorktreeChecked).not.toHaveBeenCalled();
    const call = purgeSessionMounts.mock.calls[0]?.[0];
    expect(call?.retained).toHaveLength(1);
  });

  it('stops before marking the session deleted when the mount purge fails', async () => {
    const store = makeStore();
    purgeSessionMounts.mockRejectedValueOnce(new Error('database is locked'));

    await expect(deleteTask(vi.fn(), (() => store) as never)(SESSION_ID)).rejects.toThrow(
      'database is locked',
    );
    expect(purgeSessionForDelete).not.toHaveBeenCalled();
  });
});
