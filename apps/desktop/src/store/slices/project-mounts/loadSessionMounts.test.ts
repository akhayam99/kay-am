import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, MountOperation, ProjectId, SessionId, SessionMount } from '@goodboy/types';

const h = vi.hoisted(() => ({
  mounts: new Map<string, SessionMount>(),
  operations: new Map<string, MountOperation>(),
  listMountOperations: vi.fn(),
  upsertMountOperation: vi.fn(),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  inspectWorktree: vi.fn(async () => ({ kind: 'missing', path: '/repo/.goodboy/worktrees/gone' })),
}));
vi.mock('@goodboy/db', () => ({
  listSessionMounts: vi.fn(async () => [...h.mounts.values()]),
  getSessionMount: vi.fn(async () => null),
  updateSessionMountLifecycle: vi.fn(async () => true),
  insertSessionMount: vi.fn(async () => undefined),
  listMountOperations: h.listMountOperations,
  upsertMountOperation: h.upsertMountOperation,
}));

import { loadSessionMounts } from './loadSessionMounts';
import { resetMountRecoveryGuard } from './mountRecoveryGuard';

const SESSION_ID = 'session-load' as SessionId;
const PROJECT_ID = 'project-load' as ProjectId;
const NOW = '2026-09-09T10:00:00.000Z' as SessionMount['createdAt'];

const unsettledOperation = (): MountOperation => ({
  id: 'operation-unmount',
  sessionId: SESSION_ID,
  mountId: 'mount-gone' as MountId,
  requestId: 'request-unmount',
  kind: 'unmount',
  status: 'running',
  expectedRevision: 0,
  input: {
    projectId: PROJECT_ID,
    repoRoot: '/repo',
    worktreePath: '/repo/.goodboy/worktrees/gone',
  },
  result: null,
  errorCode: null,
  createdAt: NOW,
  updatedAt: NOW,
});

type State = Record<string, unknown>;

const makeState = (): State => ({
  projects: [
    {
      id: PROJECT_ID,
      workspaceId: 'workspace-load',
      name: 'API',
      rootPath: '/repo',
      kind: 'repo',
      baseBranch: 'main',
      overrides: {},
    },
  ],
  sessions: [{ id: SESSION_ID, workspaceId: 'workspace-load' }],
  sessionMounts: {},
  sessionProjectMounts: {},
  sessionActiveMount: {},
  sessionActiveProject: {},
  sessionBranches: {},
  sessionWorktrees: {},
});

const load = async () => {
  const state = makeState();
  const set = (updater: Partial<State> | ((current: State) => Partial<State>)) => {
    Object.assign(state, typeof updater === 'function' ? updater(state) : updater);
  };
  await loadSessionMounts(set as never, (() => state) as never)({ sessionId: SESSION_ID });
  await Promise.resolve();
  await Promise.resolve();
  return state;
};

beforeEach(() => {
  vi.clearAllMocks();
  resetMountRecoveryGuard();
  h.mounts.clear();
  h.operations.clear();
  h.mounts.set('mount-gone', {
    id: 'mount-gone' as MountId,
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    worktreePath: null,
    lastWorktreePath: '/repo/.goodboy/worktrees/gone',
    branch: 'feature/gone',
    baseBranch: 'main',
    parallelIndex: 1,
    mountName: 'API',
    repoSlug: null,
    isAttached: false,
    diskState: 'removed',
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
  });
  h.operations.set('request-unmount', unsettledOperation());
  h.listMountOperations.mockImplementation(async () => [...h.operations.values()]);
  h.upsertMountOperation.mockImplementation(
    async ({ operation }: { readonly operation: MountOperation }) => {
      h.operations.set(operation.requestId, operation);
    },
  );
});

describe('loadSessionMounts', () => {
  it('settles an operation left unsettled by a crash once the mounts are hydrated', async () => {
    await load();

    expect(h.operations.get('request-unmount')?.status).toBe('succeeded');
  });

  it('recovers once per session however often the mounts are hydrated', async () => {
    await load();
    await load();
    await load();

    expect(h.listMountOperations).toHaveBeenCalledTimes(1);
  });
});
