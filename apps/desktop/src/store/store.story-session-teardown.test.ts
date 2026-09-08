import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  archiveSession,
  changeWorktreeBranch,
  removeSessionDirectory,
  removeWorktree,
  scratchDirRemove,
  tidyRepoGoodboyDir,
  listWorktreesForSession,
  updateSessionWorktreeBranch,
  listSessionMounts,
  updateSessionMountBranch,
  getMountOperation,
  upsertMountOperation,
  deleteSession,
  purgeSessionForDelete,
  deleteFileVersionsForSession,
  fileVersionsPurgeSession,
  detectRepoSlug,
  gitPush,
  tauriGhRunner,
} = vi.hoisted(() => ({
  archiveSession: vi.fn(async () => undefined),
  changeWorktreeBranch: vi.fn(async () => undefined),
  removeSessionDirectory: vi.fn(async () => undefined),
  removeWorktree: vi.fn(async () => undefined),
  scratchDirRemove: vi.fn(async () => undefined),
  tidyRepoGoodboyDir: vi.fn(async () => undefined),
  listWorktreesForSession: vi.fn(async () => [] as ReadonlyArray<unknown>),
  updateSessionWorktreeBranch: vi.fn(async () => undefined),
  listSessionMounts: vi.fn(async () => [] as ReadonlyArray<unknown>),
  updateSessionMountBranch: vi.fn(async () => true),
  getMountOperation: vi.fn(async () => null),
  upsertMountOperation: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
  purgeSessionForDelete: vi.fn(async () => undefined),
  deleteFileVersionsForSession: vi.fn(async () => undefined),
  fileVersionsPurgeSession: vi.fn(async () => undefined),
  detectRepoSlug: vi.fn(async () => 'acme/widgets'),
  gitPush: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  tauriGhRunner: {},
}));

vi.mock('@goodboy/db', () => ({
  archiveSession,
  listWorktreesForSession,
  updateSessionWorktreeBranch,
  listSessionMounts,
  updateSessionMountBranch,
  getMountOperation,
  upsertMountOperation,
  deleteSession,
  purgeSessionForDelete,
  deleteFileVersionsForSession,
  listMountPullRequestLinks: vi.fn(async () => []),
  upsertMountPullRequestLink: vi.fn(async () => true),
  upsertGithubPrCache: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/core', () => ({
  detectRepoSlug,
  fetchLinkedIssues: vi.fn(async () => []),
  getPrForBranch: vi.fn(async () => null),
  listPrsForBranch: vi.fn(async () => []),
  toCachedPullRequest: vi.fn(() => null),
}));

vi.mock('../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('../features/worktree/worktree', () => ({
  changeWorktreeBranch,
  removeSessionDirectory,
  removeWorktree,
  scratchDirRemove,
  tidyRepoGoodboyDir,
  invalidateLocalBranchesCache: vi.fn(),
}));

vi.mock('../features/file-versions/fileVersions', () => ({
  fileVersionsPurgeSession,
  fileVersionsDelete: vi.fn(async () => undefined),
}));

vi.mock('../features/chat/turn', () => ({ cancelTurn: vi.fn(async () => undefined) }));

vi.mock('../features/github/github', () => ({
  createTauriPrCacheStore: vi.fn(() => ({})),
  gitPush,
  tauriGhRunner,
}));

import { archiveTask } from './slices/sessions/archiveTask';
import { changeSessionBranch } from './slices/worktrees/changeSessionBranch';
import { deleteTask } from './slices/sessions/deleteTask';
import { pushSessionBranch } from './slices/github/pushSessionBranch';
import { refreshSessionPr } from './slices/github/refreshSessionPr';

const SESSION_ID = 'sess-1' as never;
const WORKSPACE_ID = 'ws-1';
const CONTAINER_PATH = '/tmp/sessions/study-plan';
const API_PROJECT_ID = 'project-api';
const WEB_PROJECT_ID = 'project-web';
const API_REPO_ROOT = '/repos/api';
const WEB_REPO_ROOT = '/repos/web';
const API_WORKTREE_PATH = `${CONTAINER_PATH}/api`;
const WEB_WORKTREE_PATH = `${CONTAINER_PATH}/web`;
const API_BRANCH = 'gb/api-task';
const WEB_BRANCH = 'gb/web-task';

type MountRow = {
  worktreePath: string;
  branch: string;
  parallelIndex: number;
  projectId?: string;
  mountName?: string;
};

type Mount = {
  mountId: string;
  projectId: string;
  mountName: string;
  repoRoot: string;
  worktreePath: string;
  branch: string;
};

type ProjectRow = { id: string; workspaceId: string; rootPath: string; kind: string; name: string };

type Store = {
  sessions: ReadonlyArray<{
    id: string;
    workspaceId: string;
    activeProjectId?: string;
    goal: string;
    state: { kind: string };
  }>;
  archivedSessions: Record<string, ReadonlyArray<unknown>>;
  workspaces: ReadonlyArray<{ id: string; sessionsRoot: string | null }>;
  projects: ReadonlyArray<ProjectRow>;
  sessionBranches: Record<string, string>;
  sessionWorktrees: Record<string, ReadonlyArray<string>>;
  sessionProjectMounts: Record<string, ReadonlyArray<Mount>>;
  sessionMounts: Record<string, ReadonlyArray<unknown>>;
  mountBranchObservations: Record<string, ReadonlyArray<unknown>>;
  sessionActiveProject: Record<string, string>;
  sessionGithub: Record<string, unknown>;
  sessionProjectPrs: Record<string, Readonly<Record<string, ReadonlyArray<unknown>>>>;
  sessionSelectedPrNumber: Record<string, number | null>;
  sessionExternalTasks: Record<string, ReadonlyArray<{ readonly branch?: string }>>;
  sessionPhaseRuns: Record<string, ReadonlyArray<unknown>>;
  closeSessionTerminals: () => Promise<void>;
  evictSession: () => void;
  emitNotification: () => void;
  recordSessionEvent: () => Promise<void>;
};

type MakeStoreParams = {
  readonly projects: ReadonlyArray<ProjectRow>;
  readonly mounts: ReadonlyArray<Mount>;
  readonly branch: string;
  readonly activeProjectId?: string;
};

const makeStore = ({ projects, mounts, branch, activeProjectId }: MakeStoreParams): Store => ({
  sessions: [
    {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      ...(activeProjectId === undefined ? {} : { activeProjectId }),
      goal: 'plan a trip',
      state: { kind: 'idle' },
    },
  ],
  archivedSessions: {},
  workspaces: [{ id: WORKSPACE_ID, sessionsRoot: '/tmp/sessions' }],
  projects,
  sessionBranches: { [SESSION_ID]: branch },
  sessionWorktrees: {
    [SESSION_ID]: [CONTAINER_PATH, ...mounts.map((mount) => mount.worktreePath)],
  },
  sessionProjectMounts: { [SESSION_ID]: mounts },
  sessionMounts: {},
  mountBranchObservations: {},
  sessionActiveProject: activeProjectId === undefined ? {} : { [SESSION_ID]: activeProjectId },
  sessionGithub: {},
  sessionProjectPrs: {},
  sessionSelectedPrNumber: {},
  sessionExternalTasks: {},
  sessionPhaseRuns: {},
  closeSessionTerminals: vi.fn(async () => undefined),
  evictSession: vi.fn(),
  emitNotification: vi.fn(),
  recordSessionEvent: vi.fn(async () => undefined),
});

const rowsFor = (mounts: ReadonlyArray<Mount>, containerBranch: string): Array<MountRow> => [
  { worktreePath: CONTAINER_PATH, branch: containerBranch, parallelIndex: 0 },
  ...mounts.map((mount, index) => ({
    worktreePath: mount.worktreePath,
    branch: mount.branch,
    parallelIndex: index + 1,
    projectId: mount.projectId,
    mountName: mount.mountName,
  })),
];

const mountRowsFor = (mounts: ReadonlyArray<Mount>): Array<Record<string, unknown>> =>
  mounts.map((mount, index) => ({
    id: mount.mountId,
    sessionId: SESSION_ID,
    projectId: mount.projectId,
    worktreePath: mount.worktreePath,
    lastWorktreePath: mount.worktreePath,
    branch: mount.branch,
    baseBranch: null,
    parallelIndex: index + 1,
    mountName: mount.mountName,
    repoSlug: null,
    isAttached: true,
    diskState: 'present',
    revision: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));

const folderStore = () =>
  makeStore({
    projects: [
      {
        id: API_PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        rootPath: '/root',
        kind: 'folder',
        name: 'project',
      },
    ],
    mounts: [
      {
        mountId: 'mount-project',
        projectId: API_PROJECT_ID,
        mountName: 'project',
        repoRoot: '/root',
        worktreePath: `${CONTAINER_PATH}/project`,
        branch: '',
      },
    ],
    branch: '',
    activeProjectId: API_PROJECT_ID,
  });

const repoStore = () =>
  makeStore({
    projects: [
      {
        id: API_PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        rootPath: API_REPO_ROOT,
        kind: 'repo',
        name: 'api',
      },
    ],
    mounts: [
      {
        mountId: 'mount-api',
        projectId: API_PROJECT_ID,
        mountName: 'api',
        repoRoot: API_REPO_ROOT,
        worktreePath: API_WORKTREE_PATH,
        branch: API_BRANCH,
      },
    ],
    branch: API_BRANCH,
    activeProjectId: API_PROJECT_ID,
  });

const twoProjectStore = (activeProjectId?: string) =>
  makeStore({
    projects: [
      {
        id: API_PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        rootPath: API_REPO_ROOT,
        kind: 'repo',
        name: 'api',
      },
      {
        id: WEB_PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        rootPath: WEB_REPO_ROOT,
        kind: 'repo',
        name: 'web',
      },
    ],
    mounts: [
      {
        mountId: 'mount-api',
        projectId: API_PROJECT_ID,
        mountName: 'api',
        repoRoot: API_REPO_ROOT,
        worktreePath: API_WORKTREE_PATH,
        branch: API_BRANCH,
      },
      {
        mountId: 'mount-web',
        projectId: WEB_PROJECT_ID,
        mountName: 'web',
        repoRoot: WEB_REPO_ROOT,
        worktreePath: WEB_WORKTREE_PATH,
        branch: WEB_BRANCH,
      },
    ],
    branch: API_BRANCH,
    ...(activeProjectId === undefined ? {} : { activeProjectId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  listWorktreesForSession.mockReset();
});

describe('story: deleting a session that never did any work', () => {
  it('is a pure database and state operation with no filesystem teardown', async () => {
    const store = makeStore({
      projects: [
        {
          id: API_PROJECT_ID,
          workspaceId: WORKSPACE_ID,
          rootPath: API_REPO_ROOT,
          kind: 'repo',
          name: 'api',
        },
      ],
      mounts: [],
      branch: '',
    });
    listWorktreesForSession.mockResolvedValueOnce([]);

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).not.toHaveBeenCalled();
    expect(removeSessionDirectory).not.toHaveBeenCalled();
    expect(scratchDirRemove).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    const notificationKinds = (store.emitNotification as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(notificationKinds).not.toContain('error');
    expect(purgeSessionForDelete).toHaveBeenCalledOnce();
  });
});

describe('story: a branchless folder session lives and dies without git', () => {
  it('never switches branch', async () => {
    const store = folderStore();

    await changeSessionBranch(vi.fn(), (() => store) as never)(SESSION_ID, {
      branch: 'main',
      createNew: false,
    });

    expect(changeWorktreeBranch).not.toHaveBeenCalled();
    expect(updateSessionWorktreeBranch).not.toHaveBeenCalled();
  });

  it('deletes without removing a git worktree, purging file versions instead', async () => {
    const store = folderStore();
    listWorktreesForSession.mockResolvedValueOnce(
      rowsFor(store.sessionProjectMounts[SESSION_ID]!, ''),
    );

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).not.toHaveBeenCalled();
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: CONTAINER_PATH,
      path: `${CONTAINER_PATH}/project`,
    });
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: '/tmp/sessions',
      path: CONTAINER_PATH,
    });
    expect(fileVersionsPurgeSession).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    expect(purgeSessionForDelete).toHaveBeenCalledOnce();
  });

  it('never refreshes a pull request', async () => {
    const store = folderStore();

    await refreshSessionPr(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(detectRepoSlug).not.toHaveBeenCalled();
  });
});

describe('story: a repo-backed session keeps its git lifecycle', () => {
  it('still switches the mount branch and updates its database row', async () => {
    const store = repoStore();
    listSessionMounts.mockResolvedValue(mountRowsFor(store.sessionProjectMounts[SESSION_ID]!));

    await changeSessionBranch(vi.fn(), (() => store) as never)(SESSION_ID, {
      branch: 'main',
      createNew: false,
    });

    expect(changeWorktreeBranch).toHaveBeenCalledWith({
      repoPath: API_REPO_ROOT,
      worktreePath: API_WORKTREE_PATH,
      branch: 'main',
      createNew: false,
    });
  });

  it('removes its mount worktree and the container on delete', async () => {
    const store = repoStore();
    listWorktreesForSession.mockResolvedValueOnce(
      rowsFor(store.sessionProjectMounts[SESSION_ID]!, API_BRANCH),
    );

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).toHaveBeenCalledWith(API_REPO_ROOT, API_WORKTREE_PATH);
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: '/tmp/sessions',
      path: CONTAINER_PATH,
    });
    expect(fileVersionsPurgeSession).not.toHaveBeenCalled();
  });

  it('still refreshes its pull request against the mount repo', async () => {
    const store = repoStore();

    await refreshSessionPr(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(detectRepoSlug).toHaveBeenCalled();
  });
});

describe('story: a two-project session routes git work through the active mount', () => {
  it('pushes from the first mount when no explicit active mount is set', async () => {
    const store = twoProjectStore();

    await pushSessionBranch((() => store) as never, SESSION_ID);

    expect(gitPush).toHaveBeenCalledOnce();
    expect(gitPush).toHaveBeenCalledWith(
      API_WORKTREE_PATH,
      API_BRANCH,
      WORKSPACE_ID,
      API_PROJECT_ID,
    );
  });

  it('pushes from the second mount when it is the explicit active mount', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);

    await pushSessionBranch((() => store) as never, SESSION_ID);

    expect(gitPush).toHaveBeenCalledOnce();
    expect(gitPush).toHaveBeenCalledWith(
      WEB_WORKTREE_PATH,
      WEB_BRANCH,
      WORKSPACE_ID,
      WEB_PROJECT_ID,
    );
  });

  it('resolves the pull request repo slug against the active mount repo root', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);

    await refreshSessionPr(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(detectRepoSlug).toHaveBeenCalledWith(
      tauriGhRunner,
      WEB_WORKTREE_PATH,
      WORKSPACE_ID,
      WEB_PROJECT_ID,
    );
  });

  it('changes the active mount branch and updates its database row', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);
    listSessionMounts.mockResolvedValue(mountRowsFor(store.sessionProjectMounts[SESSION_ID]!));

    await changeSessionBranch(vi.fn(), (() => store) as never)(SESSION_ID, {
      branch: 'gb/web-next',
      createNew: false,
    });

    expect(changeWorktreeBranch).toHaveBeenCalledWith({
      repoPath: WEB_REPO_ROOT,
      worktreePath: WEB_WORKTREE_PATH,
      branch: 'gb/web-next',
      createNew: false,
    });
    expect(updateSessionMountBranch).toHaveBeenCalledWith(
      expect.objectContaining({ mountId: 'mount-web', branch: 'gb/web-next' }),
    );
  });

  it('removes every mount worktree and the container directory on delete', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);
    listWorktreesForSession.mockResolvedValueOnce(
      rowsFor(store.sessionProjectMounts[SESSION_ID]!, API_BRANCH),
    );

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(removeWorktree).toHaveBeenNthCalledWith(1, API_REPO_ROOT, API_WORKTREE_PATH);
    expect(removeWorktree).toHaveBeenNthCalledWith(2, WEB_REPO_ROOT, WEB_WORKTREE_PATH);
    expect(tidyRepoGoodboyDir).toHaveBeenCalledWith({ repoPath: API_REPO_ROOT });
    expect(tidyRepoGoodboyDir).toHaveBeenCalledWith({ repoPath: WEB_REPO_ROOT });
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: '/tmp/sessions',
      path: CONTAINER_PATH,
    });
    expect(purgeSessionForDelete).toHaveBeenCalledOnce();
  });

  it('keeps every worktree and the container on disk when the session is archived', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);

    await archiveTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(archiveSession).toHaveBeenCalledOnce();
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(removeSessionDirectory).not.toHaveBeenCalled();
    expect(tidyRepoGoodboyDir).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('continues container cleanup when one mount removal fails, and tells the user', async () => {
    const store = twoProjectStore(WEB_PROJECT_ID);
    listWorktreesForSession.mockResolvedValueOnce(
      rowsFor(store.sessionProjectMounts[SESSION_ID]!, API_BRANCH),
    );
    removeWorktree.mockRejectedValueOnce(new Error('project removal failed'));

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(removeSessionDirectory).toHaveBeenCalledOnce();
    expect(store.emitNotification).toHaveBeenCalled();
  });
});

describe('story: deleting a session created before project mounts existed', () => {
  it('removes a legacy mount row through its project name', async () => {
    const store = repoStore();
    listWorktreesForSession.mockResolvedValueOnce([
      { worktreePath: CONTAINER_PATH, branch: API_BRANCH, parallelIndex: 0 },
      { worktreePath: API_WORKTREE_PATH, branch: API_BRANCH, parallelIndex: 1, mountName: 'api' },
    ]);

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).toHaveBeenCalledWith(API_REPO_ROOT, API_WORKTREE_PATH);
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: '/tmp/sessions',
      path: CONTAINER_PATH,
    });
    expect(purgeSessionForDelete).toHaveBeenCalledOnce();
  });

  it('falls back to a plain directory removal when no project matches the row', async () => {
    const store = repoStore();
    listWorktreesForSession.mockResolvedValueOnce([
      { worktreePath: CONTAINER_PATH, branch: '', parallelIndex: 0 },
      { worktreePath: `${CONTAINER_PATH}/mystery`, branch: '', parallelIndex: 1 },
    ]);

    await deleteTask(vi.fn(), (() => store) as never)(SESSION_ID);

    expect(removeWorktree).not.toHaveBeenCalled();
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: CONTAINER_PATH,
      path: `${CONTAINER_PATH}/mystery`,
    });
    expect(removeSessionDirectory).toHaveBeenCalledWith({
      basePath: '/tmp/sessions',
      path: CONTAINER_PATH,
    });
    expect(purgeSessionForDelete).toHaveBeenCalledOnce();
  });
});
