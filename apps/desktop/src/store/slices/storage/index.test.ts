import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectId, SessionId, WorkspaceId } from '@goodboy/types';
import type { AppStore } from '../../store';

const {
  listArchivedSessionRefs,
  listArchivedSessionMounts,
  listAllRetainedWorktreePaths,
  deleteTurnEventsForSessions,
  getTurnEventStatsForSessions,
  getDatabaseSizeBytes,
  updateSessionMountLifecycle,
  vacuumDatabase,
  removeWorktreeChecked,
  worktreeWriterStatus,
  worktreeDirectorySize,
  worktreeList,
} = vi.hoisted(() => ({
  listArchivedSessionRefs: vi.fn(),
  listArchivedSessionMounts: vi.fn(),
  listAllRetainedWorktreePaths: vi.fn(),
  deleteTurnEventsForSessions: vi.fn(),
  getTurnEventStatsForSessions: vi.fn(),
  getDatabaseSizeBytes: vi.fn(),
  updateSessionMountLifecycle: vi.fn(),
  vacuumDatabase: vi.fn(),
  removeWorktreeChecked: vi.fn(),
  worktreeWriterStatus: vi.fn(),
  worktreeDirectorySize: vi.fn(),
  worktreeList: vi.fn(),
}));

vi.mock('@goodboy/db', () => ({
  listArchivedSessionRefs,
  listArchivedSessionMounts,
  listAllRetainedWorktreePaths,
  deleteTurnEventsForSessions,
  getTurnEventStatsForSessions,
  getDatabaseSizeBytes,
  updateSessionMountLifecycle,
  vacuumDatabase,
}));

vi.mock('../../../shared/lib/db', () => ({
  tauriDatabase: {},
}));

vi.mock('../../../features/worktree/worktree', () => ({
  removeWorktreeChecked,
  worktreeWriterStatus,
  worktreeDirectorySize,
  worktreeList,
}));

import { collectArchivedWorktrees } from './collectArchivedWorktrees';
import { loadStorageStats } from './loadStorageStats';
import { pruneArchivedTranscripts } from './pruneArchivedTranscripts';
import { removeArchivedWorktrees } from './removeArchivedWorktrees';

const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const ARCHIVED_SESSION = 'session-archived' as SessionId;
const LIVE_SESSION = 'session-live' as SessionId;

const project = {
  id: PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  name: 'project',
  rootPath: '/repo',
  kind: 'repo',
} as Project;

type StoredMount = {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly worktreePath: string;
  readonly branch: string;
  readonly revision: number;
} & Record<string, unknown>;

const mount = (overrides: Record<string, unknown>): StoredMount =>
  ({
    sessionId: ARCHIVED_SESSION,
    projectId: PROJECT_ID,
    lastWorktreePath: null,
    baseBranch: null,
    parallelIndex: 0,
    mountName: 'project',
    repoSlug: null,
    isAttached: true,
    diskState: 'present',
    revision: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as StoredMount;

const archivedWorktree = mount({
  id: 'wt-archived',
  worktreePath: '/repo/.goodboy/worktrees/archived',
  branch: 'ak/archived',
});

const liveWorktree = mount({
  id: 'wt-live',
  sessionId: LIVE_SESSION,
  worktreePath: '/repo/.goodboy/worktrees/live',
  branch: 'ak/live',
});

const makeGet =
  (loadStats = vi.fn(async () => undefined)) =>
  () =>
    ({
      projects: [project],
      sessions: [],
      terminalTabs: {},
      loadStorageStats: loadStats,
      reconcileOrphanWorktrees: vi.fn(async () => undefined),
    }) as unknown as AppStore;

beforeEach(() => {
  vi.clearAllMocks();

  listArchivedSessionRefs.mockResolvedValue([
    { sessionId: ARCHIVED_SESSION, workspaceId: WORKSPACE_ID },
  ]);
  listArchivedSessionMounts.mockResolvedValue([archivedWorktree]);
  listAllRetainedWorktreePaths.mockResolvedValue([]);
  updateSessionMountLifecycle.mockResolvedValue(true);
  removeWorktreeChecked.mockImplementation(async ({ worktreePath }: { worktreePath: string }) => ({
    kind: 'removed',
    path: worktreePath,
  }));
  worktreeWriterStatus.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  }));
  worktreeDirectorySize.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    sizeBytes: 1024,
    isPartial: false,
    exists: true,
  }));
  worktreeList.mockResolvedValue([
    { path: '/repo', branch: 'main', head: 'a', isMain: true },
    {
      path: archivedWorktree.worktreePath,
      branch: archivedWorktree.branch,
      head: 'b',
      isMain: false,
    },
    { path: liveWorktree.worktreePath, branch: liveWorktree.branch, head: 'c', isMain: false },
  ]);
  getTurnEventStatsForSessions.mockResolvedValue({ rowCount: 12, payloadBytes: 4096 });
  getDatabaseSizeBytes.mockResolvedValue(233_000_000);
  deleteTurnEventsForSessions.mockResolvedValue(12);
});

describe('collectArchivedWorktrees', () => {
  it('keeps only the worktrees of archived sessions', async () => {
    const targets = await collectArchivedWorktrees({ projects: [project] });

    expect(targets).toEqual([
      {
        sessionId: ARCHIVED_SESSION,
        mountId: 'wt-archived',
        repoPath: '/repo',
        worktreePath: archivedWorktree.worktreePath,
        branch: 'ak/archived',
        revision: 3,
        sizeBytes: 1024,
      },
    ]);
  });

  it('drops worktrees git no longer reports', async () => {
    worktreeList.mockResolvedValue([{ path: '/repo', branch: 'main', head: 'a', isMain: true }]);

    await expect(collectArchivedWorktrees({ projects: [project] })).resolves.toEqual([]);
  });

  it('never claims a checkout whose branch matches but whose path does not', async () => {
    worktreeList.mockResolvedValue([
      { path: '/repo', branch: 'main', head: 'a', isMain: true },
      { path: '/elsewhere/checkout', branch: 'ak/archived', head: 'b', isMain: false },
    ]);

    await expect(collectArchivedWorktrees({ projects: [project] })).resolves.toEqual([]);
  });
});

describe('removeArchivedWorktrees', () => {
  it('removes only the archived session worktree and refreshes the stats', async () => {
    const loadStats = vi.fn(async () => undefined);
    const result = await removeArchivedWorktrees(vi.fn(), makeGet(loadStats))();

    expect(removeWorktreeChecked.mock.calls).toEqual([
      [{ repoPath: '/repo', worktreePath: archivedWorktree.worktreePath, mode: 'safe' }],
    ]);
    expect(updateSessionMountLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        mountId: 'wt-archived',
        worktreePath: null,
        isAttached: false,
        expectedRevision: 3,
      }),
    );
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(loadStats).toHaveBeenCalled();
  });

  it('keeps a mount the guard refuses and counts it as a failure', async () => {
    listArchivedSessionMounts.mockResolvedValue([
      archivedWorktree,
      { ...liveWorktree, sessionId: ARCHIVED_SESSION },
    ]);
    removeWorktreeChecked.mockResolvedValueOnce({
      kind: 'kept',
      path: archivedWorktree.worktreePath,
      reasons: ['locked'],
    });

    const result = await removeArchivedWorktrees(vi.fn(), makeGet())();

    expect(removeWorktreeChecked).toHaveBeenCalledTimes(2);
    expect(updateSessionMountLifecycle).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ removed: 1, failed: 1 });
  });
});

describe('pruneArchivedTranscripts', () => {
  it('deletes the archived transcripts then vacuums', async () => {
    const deleted = await pruneArchivedTranscripts(vi.fn(), makeGet())();

    expect(deleteTurnEventsForSessions).toHaveBeenCalledWith({
      db: {},
      sessionIds: [ARCHIVED_SESSION],
    });
    expect(vacuumDatabase).toHaveBeenCalled();
    expect(deleted).toBe(12);
  });

  it('does not touch the database when nothing is archived', async () => {
    listArchivedSessionRefs.mockResolvedValue([]);

    await expect(pruneArchivedTranscripts(vi.fn(), makeGet())()).resolves.toBe(0);
    expect(deleteTurnEventsForSessions).not.toHaveBeenCalled();
    expect(vacuumDatabase).not.toHaveBeenCalled();
  });
});

describe('loadStorageStats', () => {
  it('publishes the archived footprint and clears the loading flag', async () => {
    const set = vi.fn();
    await loadStorageStats(set, makeGet())();

    expect(set.mock.calls[0]?.[0]).toEqual({ storageStatsLoading: true });
    expect(set.mock.calls[1]?.[0]).toEqual({
      storageStats: {
        databaseBytes: 233_000_000,
        archivedSessionCount: 1,
        archivedTranscriptRows: 12,
        archivedTranscriptBytes: 4096,
        archivedWorktrees: [
          {
            sessionId: ARCHIVED_SESSION,
            mountId: 'wt-archived',
            repoPath: '/repo',
            worktreePath: archivedWorktree.worktreePath,
            branch: 'ak/archived',
            revision: 3,
            sizeBytes: 1024,
          },
        ],
        retainedWorktrees: [],
      },
      storageStatsLoading: false,
    });
  });

  it('publishes the retained folders with their measured size', async () => {
    listAllRetainedWorktreePaths.mockResolvedValue([
      {
        id: 'retained-1',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        sourceSessionId: ARCHIVED_SESSION,
        sourceMountId: 'wt-archived',
        repoRoot: '/repo',
        worktreePath: '/repo/.goodboy/worktrees/kept',
        branch: 'ak/kept',
        reason: 'session_delete',
        lastCheckedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const set = vi.fn();

    await loadStorageStats(set, makeGet())();

    expect(set.mock.calls[1]?.[0]).toMatchObject({
      storageStats: {
        retainedWorktrees: [
          {
            id: 'retained-1',
            repoRoot: '/repo',
            worktreePath: '/repo/.goodboy/worktrees/kept',
            branch: 'ak/kept',
            reason: 'session_delete',
            sizeBytes: 1024,
          },
        ],
      },
    });
  });
});
