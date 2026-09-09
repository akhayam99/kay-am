import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  removeWorktreeChecked,
  worktreeWriterStatus,
  deleteSessionWorktreeForProject,
  markSessionMountsRemoved,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
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
  deleteSessionWorktreeForProject: vi.fn(async () => undefined),
  markSessionMountsRemoved: vi.fn(async () => undefined),
  updateSessionActiveProject: vi.fn(async () => undefined),
  updateSessionMountLifecycle: vi.fn(async () => true),
}));

vi.mock('@goodboy/db', () => ({
  deleteSessionWorktreeForProject,
  markSessionMountsRemoved,
  updateSessionActiveProject,
  updateSessionMountLifecycle,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  removeWorktreeChecked,
  worktreeWriterStatus,
  removeSessionDirectory: vi.fn(async () => undefined),
}));

import { detachProject } from './detachProject';

const SESSION_ID = 'sess-1' as never;
const PROJECT_ID = 'project-api' as never;

const makeStore = () => ({
  sessionProjectMounts: {
    'sess-1': [
      {
        mountId: 'mount-api',
        revision: 4,
        projectId: 'project-api',
        mountName: 'api',
        worktreePath: '/container/api',
        repoRoot: '/repos/api',
        branch: 'ak/feat',
      },
      {
        mountId: 'mount-api-2',
        revision: 1,
        projectId: 'project-api',
        mountName: 'api',
        worktreePath: '/container/api-2',
        repoRoot: '/repos/api',
        branch: 'ak/feat-2',
      },
      {
        projectId: 'project-web',
        mountName: 'web',
        worktreePath: '/container/web',
        repoRoot: '/repos/web',
        branch: 'ak/feat',
      },
    ],
  },
  sessionWorktrees: {
    'sess-1': ['/container', '/container/api', '/container/api-2', '/container/web'],
  },
  sessionWorktreeRecords: undefined,
  sessionActiveProject: { 'sess-1': 'project-api' },
  sessions: [
    { id: 'sess-1', workspaceId: 'ws-1', activeProjectId: 'project-api', state: { kind: 'idle' } },
  ],
  terminalTabs: {},
  projects: [
    { id: 'project-api', workspaceId: 'ws-1', rootPath: '/repos/api', kind: 'repo', name: 'api' },
    { id: 'project-web', workspaceId: 'ws-1', rootPath: '/repos/web', kind: 'repo', name: 'web' },
  ],
  recordSessionEvent: vi.fn(async () => undefined),
});

type Store = ReturnType<typeof makeStore>;

const runDetach = async (store: Store) => {
  const set = vi.fn((updater: unknown) => {
    const patch =
      typeof updater === 'function' ? (updater as (s: Store) => object)(store) : updater;
    Object.assign(store, patch);
  });
  await detachProject(
    set as never,
    (() => store) as never,
  )({
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  removeWorktreeChecked.mockImplementation(async ({ worktreePath }: { worktreePath: string }) => ({
    kind: 'removed',
    path: worktreePath,
  }));
});

describe('detachProject', () => {
  it('removes a clean worktree and records the detach with the project name', async () => {
    const store = makeStore();

    await runDetach(store);

    expect(removeWorktreeChecked).toHaveBeenCalledWith({
      repoPath: '/repos/api',
      worktreePath: '/container/api',
    });
    expect(removeWorktreeChecked).toHaveBeenCalledWith({
      repoPath: '/repos/api',
      worktreePath: '/container/api-2',
    });
    expect(markSessionMountsRemoved).toHaveBeenCalledWith({
      db: {},
      sessionId: SESSION_ID,
      mountIds: ['mount-api', 'mount-api-2'],
    });
    expect(deleteSessionWorktreeForProject).not.toHaveBeenCalled();
    expect(store.recordSessionEvent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      kind: 'project_detached',
      payload: expect.objectContaining({
        projectId: 'project-api',
        projectName: 'api',
        branch: 'ak/feat',
        kept: false,
      }),
    });
    expect(store.sessionProjectMounts['sess-1'].map((m) => m.projectId)).toEqual(['project-web']);
    expect(store.sessionWorktrees['sess-1']).toEqual(['/container', '/container/web']);
  });

  it('keeps a dirty worktree on disk, keeps its row, and says so in the event', async () => {
    const store = makeStore();
    removeWorktreeChecked.mockResolvedValue({
      kind: 'kept',
      path: '/container/api',
      reasons: ['unstaged-changes'],
    });

    await runDetach(store);

    expect(deleteSessionWorktreeForProject).not.toHaveBeenCalled();
    expect(markSessionMountsRemoved).not.toHaveBeenCalled();
    expect(updateSessionMountLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        mountId: 'mount-api',
        worktreePath: '/container/api',
        isAttached: false,
        expectedRevision: 4,
      }),
    );
    expect(store.recordSessionEvent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      kind: 'project_detached',
      payload: expect.objectContaining({ kept: true, reason: 'unstaged-changes' }),
    });
    expect(store.sessionProjectMounts['sess-1'].map((m) => m.projectId)).toEqual(['project-web']);
  });

  it('treats a removal failure as a keep', async () => {
    const store = makeStore();
    removeWorktreeChecked.mockRejectedValue(new Error('not a git repository'));

    await runDetach(store);

    expect(deleteSessionWorktreeForProject).not.toHaveBeenCalled();
    expect(store.recordSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ kept: true }) }),
    );
  });

  it('keeps the directory when a terminal still uses the mount', async () => {
    const store = makeStore();
    store.terminalTabs = {
      'sess-1': [{ id: 'tab-1', sessionId: 'sess-1', cwd: '/container/api' }],
    } as never;

    await runDetach(store);

    expect(removeWorktreeChecked).not.toHaveBeenCalledWith({
      repoPath: '/repos/api',
      worktreePath: '/container/api',
    });
    expect(store.recordSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          worktreePath: '/container/api',
          kept: true,
          reason: 'a terminal is open in the worktree',
        }),
      }),
    );
  });

  it('marks only the mounts it cleaned when a sibling mount is kept', async () => {
    const store = makeStore();
    store.terminalTabs = {
      'sess-1': [{ id: 'tab-1', sessionId: 'sess-1', cwd: '/container/api' }],
    } as never;

    await runDetach(store);

    expect(markSessionMountsRemoved).toHaveBeenCalledWith({
      db: {},
      sessionId: SESSION_ID,
      mountIds: ['mount-api-2'],
    });
    expect(deleteSessionWorktreeForProject).not.toHaveBeenCalled();
    expect(updateSessionMountLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ mountId: 'mount-api', isAttached: false }),
    );
    expect(updateSessionMountLifecycle).not.toHaveBeenCalledWith(
      expect.objectContaining({ mountId: 'mount-api-2' }),
    );
  });

  it('hands the active project to the next remaining mount', async () => {
    const store = makeStore();

    await runDetach(store);

    expect(updateSessionActiveProject).toHaveBeenCalledWith({
      db: {},
      id: SESSION_ID,
      projectId: 'project-web',
    });
    expect(store.sessionActiveProject['sess-1']).toBe('project-web');
  });

  it('refuses a project that is not mounted', async () => {
    const store = makeStore();
    store.sessionProjectMounts['sess-1'] = store.sessionProjectMounts['sess-1'].filter(
      (m) => m.projectId !== 'project-api',
    );

    await expect(runDetach(store)).rejects.toThrow('not mounted');
  });
});
