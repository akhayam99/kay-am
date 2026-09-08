import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  operations: new Map<string, Record<string, unknown>>(),
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
    holder: null as string | null,
    token: null as string | null,
    runId: null as string | null,
    isGranted: false,
    hasExited: false,
    waiting: [] as ReadonlyArray<string>,
  })),
  worktreeDirectorySize: vi.fn(async ({ path }: { path: string }) => ({
    path,
    sizeBytes: 4096 as number | null,
    isPartial: false,
    exists: true,
  })),
  deleteLocalBranch: vi.fn(async () => undefined),
  deleteMountPullRequestLink: vi.fn(async () => undefined),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('../../../features/worktree/worktree', () => ({
  removeWorktreeChecked: h.removeWorktreeChecked,
  worktreeWriterStatus: h.worktreeWriterStatus,
  worktreeDirectorySize: h.worktreeDirectorySize,
  deleteLocalBranch: h.deleteLocalBranch,
}));

vi.mock('@goodboy/db', () => ({
  listSessionMounts: vi.fn(async () => [...h.rows.values()]),
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
      if (row === undefined || row['revision'] !== expectedRevision) {
        return false;
      }
      h.rows.set(mountId, {
        ...row,
        worktreePath,
        lastWorktreePath: worktreePath ?? row['worktreePath'] ?? row['lastWorktreePath'],
        isAttached,
        diskState,
        revision: (row['revision'] as number) + 1,
      });
      return true;
    },
  ),
  getMountOperation: vi.fn(
    async ({ sessionId, requestId }: { sessionId: string; requestId: string }) =>
      h.operations.get(`${sessionId}:${requestId}`) ?? null,
  ),
  upsertMountOperation: vi.fn(async ({ operation }: { operation: Record<string, unknown> }) => {
    h.operations.set(`${operation['sessionId']}:${operation['requestId']}`, { ...operation });
  }),
  listMountOperations: vi.fn(async ({ sessionId }: { sessionId: string }) =>
    [...h.operations.values()].filter((operation) => operation['sessionId'] === sessionId),
  ),
  listMountPathOwnership: vi.fn(async () => []),
  listAllRetainedWorktreePaths: vi.fn(async () => []),
  listUnsettledMountOperations: vi.fn(async () => []),
  detachSessionMounts: vi.fn(async () => undefined),
  deleteRetainedWorktreePath: vi.fn(async () => undefined),
  markRetainedWorktreePathChecked: vi.fn(async () => undefined),
  deleteMountPullRequestLink: h.deleteMountPullRequestLink,
}));

import { createMountCleanupSlice } from './index';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const MOUNT_ID = 'mount-1' as MountId;
const REPO_ROOT = '/repos/goodboy';
const WORKTREE_PATH = '/repos/goodboy/.goodboy/worktrees/gb-one';

type State = Record<string, unknown>;

const makeState = (): State => ({
  sessions: [{ id: SESSION_ID, workspaceId: 'workspace-1', state: { kind: 'idle' } }],
  projects: [
    {
      id: PROJECT_ID,
      workspaceId: 'workspace-1',
      kind: 'repo',
      name: 'goodboy',
      rootPath: REPO_ROOT,
    },
  ],
  terminalTabs: {},
  sessionMounts: {},
  sessionProjectMounts: {},
  sessionActiveMount: {},
  sessionActiveProject: {},
  sessionBranches: {},
  sessionWorktrees: {},
  mountCleanupProposals: {},
  retainedWorktreePaths: {},
  unmountMount: vi.fn(async () => ({ mount: {}, kept: false, reason: null })),
});

const makeSlice = () => {
  const state = makeState();
  const set = vi.fn((updater: Partial<State> | ((current: State) => Partial<State>)) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    Object.assign(state, patch);
  });
  const slice = createMountCleanupSlice(set as never, (() => state) as never);
  return { state, slice };
};

const seedMount = ({ branch = 'ak/one', path = WORKTREE_PATH as string | null } = {}): void => {
  h.rows.set(MOUNT_ID, {
    id: MOUNT_ID,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    worktreePath: path,
    lastWorktreePath: path,
    branch,
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
};

beforeEach(() => {
  h.rows.clear();
  h.operations.clear();
  vi.clearAllMocks();
  h.removeWorktreeChecked.mockImplementation(
    async ({ worktreePath }: { worktreePath: string }) => ({
      kind: 'removed',
      path: worktreePath,
    }),
  );
  h.worktreeWriterStatus.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  }));
  h.worktreeDirectorySize.mockImplementation(async ({ path }: { path: string }) => ({
    path,
    sizeBytes: 4096,
    isPartial: false,
    exists: true,
  }));
});

describe('cleanup proposals after a merge', () => {
  it('persists a proposal with the measured size and the merged request', async () => {
    seedMount();
    const { slice, state } = makeSlice();

    const proposal = await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
      expectedBranch: 'ak/one',
      request: { provider: 'github', host: 'github.com', repoSlug: 'acme/web', prNumber: 42 },
    });

    expect(proposal).toMatchObject({ worktreePath: WORKTREE_PATH, sizeBytes: 4096 });
    expect(
      (state['mountCleanupProposals'] as Record<string, ReadonlyArray<unknown>>)[SESSION_ID],
    ).toHaveLength(1);
  });

  it('never proposes cleanup for a mount that has switched to another branch', async () => {
    seedMount({ branch: 'ak/next' });
    const { slice } = makeSlice();

    const proposal = await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
      expectedBranch: 'ak/one',
    });

    expect(proposal).toBeNull();
    expect(h.operations.size).toBe(0);
  });

  it('proposes only once while the first proposal is still pending or decided', async () => {
    seedMount();
    const { slice } = makeSlice();
    const input = {
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup' as const,
      expectedBranch: 'ak/one',
    };

    await slice.proposeMountCleanup(input);
    await slice.resolveMountCleanup({
      sessionId: SESSION_ID,
      requestId: `cleanup:merge_cleanup:${MOUNT_ID}:ak/one`,
      decision: 'keep',
    });
    const second = await slice.proposeMountCleanup(input);

    expect(second).toBeNull();
    expect(h.operations.size).toBe(1);
  });
});

describe('resolving a cleanup proposal', () => {
  it('keeps the directory and settles the proposal without unmounting', async () => {
    seedMount();
    const { slice, state } = makeSlice();
    await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
    });

    await slice.resolveMountCleanup({
      sessionId: SESSION_ID,
      requestId: `cleanup:merge_cleanup:${MOUNT_ID}:ak/one`,
      decision: 'keep',
    });

    expect(state['unmountMount']).not.toHaveBeenCalled();
    expect(
      (state['mountCleanupProposals'] as Record<string, ReadonlyArray<unknown>>)[SESSION_ID],
    ).toEqual([]);
    expect(h.rows.get(MOUNT_ID)?.['worktreePath']).toBe(WORKTREE_PATH);
  });

  it('unmounts through the shared lifecycle action when the mount still matches', async () => {
    seedMount();
    const { slice, state } = makeSlice();
    await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
    });

    await slice.resolveMountCleanup({
      sessionId: SESSION_ID,
      requestId: `cleanup:merge_cleanup:${MOUNT_ID}:ak/one`,
      decision: 'remove',
    });

    expect(state['unmountMount']).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, mountId: MOUNT_ID }),
    );
  });

  it('refuses to clean a mount that moved to another branch after the merge', async () => {
    seedMount();
    const { slice, state } = makeSlice();
    await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
    });
    seedMount({ branch: 'ak/next' });

    await slice.resolveMountCleanup({
      sessionId: SESSION_ID,
      requestId: `cleanup:merge_cleanup:${MOUNT_ID}:ak/one`,
      decision: 'remove',
    });

    expect(state['unmountMount']).not.toHaveBeenCalled();
    expect(h.rows.get(MOUNT_ID)?.['worktreePath']).toBe(WORKTREE_PATH);
  });
});

describe('cleaning the mounts of a session', () => {
  it('keeps every directory and proposes cleanup when directories are kept', async () => {
    seedMount();
    const { slice, state } = makeSlice();

    const outcomes = await slice.cleanupSessionMounts({
      sessionId: SESSION_ID,
      reason: 'archive',
      keepDirectories: true,
    });

    expect(h.removeWorktreeChecked).not.toHaveBeenCalled();
    expect(outcomes[0]?.decision).toMatchObject({ kind: 'kept' });
    expect(
      (state['mountCleanupProposals'] as Record<string, ReadonlyArray<unknown>>)[SESSION_ID],
    ).toHaveLength(1);
    expect(h.rows.get(MOUNT_ID)?.['worktreePath']).toBe(WORKTREE_PATH);
  });

  it('clears the path of a removed directory and preserves the logical mount', async () => {
    seedMount();
    const { slice } = makeSlice();

    await slice.cleanupSessionMounts({ sessionId: SESSION_ID, reason: 'archive' });

    const row = h.rows.get(MOUNT_ID);
    expect(row?.['worktreePath']).toBeNull();
    expect(row?.['lastWorktreePath']).toBe(WORKTREE_PATH);
    expect(row?.['branch']).toBe('ak/one');
    expect(row?.['diskState']).toBe('removed');
  });

  it('keeps a directory a writer lease still holds and proposes it instead', async () => {
    seedMount();
    h.worktreeWriterStatus.mockResolvedValue({
      path: WORKTREE_PATH,
      holder: 'run-1',
      token: 't',
      runId: 'run-1',
      isGranted: true,
      hasExited: false,
      waiting: [],
    });
    const { slice } = makeSlice();

    const outcomes = await slice.cleanupSessionMounts({ sessionId: SESSION_ID, reason: 'archive' });

    expect(h.removeWorktreeChecked).not.toHaveBeenCalled();
    expect(outcomes[0]?.decision).toMatchObject({
      kind: 'kept',
      reason: 'a writer lease still holds the worktree',
    });
    expect(h.rows.get(MOUNT_ID)?.['worktreePath']).toBe(WORKTREE_PATH);
  });

  it('never deletes a local branch or the pull request ownership of a mount', async () => {
    seedMount();
    const { slice } = makeSlice();
    await slice.proposeMountCleanup({
      sessionId: SESSION_ID,
      mountId: MOUNT_ID,
      reason: 'merge_cleanup',
    });

    await slice.cleanupSessionMounts({ sessionId: SESSION_ID, reason: 'settings' });

    expect(h.deleteLocalBranch).not.toHaveBeenCalled();
    expect(h.deleteMountPullRequestLink).not.toHaveBeenCalled();
    expect(h.rows.get(MOUNT_ID)).toBeDefined();
    expect(h.rows.get(MOUNT_ID)?.['branch']).toBe('ak/one');
  });

  it('keeps a directory while an agent still runs in the session', async () => {
    seedMount();
    const { slice, state } = makeSlice();
    state['sessions'] = [
      { id: SESSION_ID, workspaceId: 'workspace-1', state: { kind: 'running' } },
    ];

    const outcomes = await slice.cleanupSessionMounts({ sessionId: SESSION_ID, reason: 'archive' });

    expect(h.removeWorktreeChecked).not.toHaveBeenCalled();
    expect(outcomes[0]?.decision).toMatchObject({
      kind: 'kept',
      reason: 'an agent is still running in this session',
    });
  });
});
