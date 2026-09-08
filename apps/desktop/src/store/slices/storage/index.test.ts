import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectId, SessionId, WorkspaceId } from '@goodboy/types';
import type { AppStore } from '../../store';

const {
  listArchivedSessionRefs,
  listWorktreesForSessions,
  deleteTurnEventsForSessions,
  getTurnEventStatsForSessions,
  getDatabaseSizeBytes,
  vacuumDatabase,
  removeWorktree,
  worktreeList,
} = vi.hoisted(() => ({
  listArchivedSessionRefs: vi.fn(),
  listWorktreesForSessions: vi.fn(),
  deleteTurnEventsForSessions: vi.fn(),
  getTurnEventStatsForSessions: vi.fn(),
  getDatabaseSizeBytes: vi.fn(),
  vacuumDatabase: vi.fn(),
  removeWorktree: vi.fn(),
  worktreeList: vi.fn(),
}));

vi.mock('@goodboy/db', () => ({
  listArchivedSessionRefs,
  listWorktreesForSessions,
  deleteTurnEventsForSessions,
  getTurnEventStatsForSessions,
  getDatabaseSizeBytes,
  vacuumDatabase,
}));

vi.mock('../../../shared/lib/db', () => ({
  tauriDatabase: {},
}));

vi.mock('../../../features/worktree/worktree', () => ({
  removeWorktree,
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

const archivedWorktree = {
  id: 'wt-archived',
  sessionId: ARCHIVED_SESSION,
  projectId: PROJECT_ID,
  worktreePath: '/repo/.goodboy/worktrees/archived',
  branch: 'ak/archived',
  parallelIndex: 0,
  createdAt: 0,
};

const liveWorktree = {
  id: 'wt-live',
  sessionId: LIVE_SESSION,
  projectId: PROJECT_ID,
  worktreePath: '/repo/.goodboy/worktrees/live',
  branch: 'ak/live',
  parallelIndex: 0,
  createdAt: 0,
};

const makeGet =
  (loadStats = vi.fn(async () => undefined)) =>
  () =>
    ({ projects: [project], loadStorageStats: loadStats }) as unknown as AppStore;

beforeEach(() => {
  listArchivedSessionRefs.mockReset();
  listWorktreesForSessions.mockReset();
  deleteTurnEventsForSessions.mockReset();
  getTurnEventStatsForSessions.mockReset();
  getDatabaseSizeBytes.mockReset();
  vacuumDatabase.mockReset();
  removeWorktree.mockReset();
  worktreeList.mockReset();

  listArchivedSessionRefs.mockResolvedValue([
    { sessionId: ARCHIVED_SESSION, workspaceId: WORKSPACE_ID },
  ]);
  listWorktreesForSessions.mockResolvedValue(
    new Map([
      [ARCHIVED_SESSION, [archivedWorktree]],
      [LIVE_SESSION, [liveWorktree]],
    ]),
  );
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
        repoPath: '/repo',
        worktreePath: archivedWorktree.worktreePath,
      },
    ]);
  });

  it('drops worktrees git no longer reports', async () => {
    worktreeList.mockResolvedValue([{ path: '/repo', branch: 'main', head: 'a', isMain: true }]);

    await expect(collectArchivedWorktrees({ projects: [project] })).resolves.toEqual([]);
  });
});

describe('removeArchivedWorktrees', () => {
  it('removes only the archived session worktree and refreshes the stats', async () => {
    const loadStats = vi.fn(async () => undefined);
    const result = await removeArchivedWorktrees(vi.fn(), makeGet(loadStats))();

    expect(removeWorktree.mock.calls).toEqual([['/repo', archivedWorktree.worktreePath]]);
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(loadStats).toHaveBeenCalled();
  });

  it('counts failures without aborting the remaining removals', async () => {
    listWorktreesForSessions.mockResolvedValue(
      new Map([
        [ARCHIVED_SESSION, [archivedWorktree, { ...liveWorktree, sessionId: ARCHIVED_SESSION }]],
      ]),
    );
    removeWorktree.mockRejectedValueOnce(new Error('worktree locked'));

    const result = await removeArchivedWorktrees(vi.fn(), makeGet())();

    expect(removeWorktree).toHaveBeenCalledTimes(2);
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
            repoPath: '/repo',
            worktreePath: archivedWorktree.worktreePath,
          },
        ],
      },
      storageStatsLoading: false,
    });
  });
});
