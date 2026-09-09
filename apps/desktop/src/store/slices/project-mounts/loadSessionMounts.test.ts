import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, MountOperation, ProjectId, SessionId, SessionMount } from '@goodboy/types';

const h = vi.hoisted(() => ({
  mounts: new Map<string, SessionMount>(),
  operations: new Map<string, MountOperation>(),
  inspections: new Map<string, Record<string, unknown>>(),
  listMountOperations: vi.fn(),
  upsertMountOperation: vi.fn(),
  updateSessionMountLifecycle: vi.fn(),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  inspectWorktree: vi.fn(async ({ worktreePath }: { readonly worktreePath: string }) => {
    const found = h.inspections.get(worktreePath);
    if (found === undefined) {
      return { kind: 'missing', path: worktreePath };
    }
    return found;
  }),
}));
vi.mock('@goodboy/db', () => ({
  listSessionMounts: vi.fn(async () => [...h.mounts.values()]),
  getSessionMount: vi.fn(async () => null),
  updateSessionMountLifecycle: h.updateSessionMountLifecycle,
  insertSessionMount: vi.fn(async () => undefined),
  listMountOperations: h.listMountOperations,
  upsertMountOperation: h.upsertMountOperation,
}));

import { loadSessionMounts } from './loadSessionMounts';
import { resetMountRecoveryGuard } from './mountRecoveryGuard';

const SESSION_ID = 'session-load' as SessionId;
const PROJECT_ID = 'project-load' as ProjectId;
const NOW = '2026-09-09T10:00:00.000Z' as SessionMount['createdAt'];
const GONE_PATH = '/repo/.goodboy/worktrees/gone';
const UNREACHABLE_PATH = '/repo/.goodboy/worktrees/unreachable';

const mountFixture = ({
  id,
  worktreePath,
}: {
  readonly id: string;
  readonly worktreePath: string | null;
}): SessionMount => ({
  id: id as MountId,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  worktreePath,
  lastWorktreePath: worktreePath,
  branch: `feature/${id}`,
  baseBranch: 'main',
  parallelIndex: 1,
  mountName: 'API',
  repoSlug: null,
  isAttached: worktreePath !== null,
  diskState: worktreePath === null ? 'removed' : 'present',
  revision: 0,
  createdAt: NOW,
  updatedAt: NOW,
});

const unsettledOperation = (): MountOperation => ({
  id: 'operation-unmount',
  sessionId: SESSION_ID,
  mountId: 'mount-gone' as MountId,
  requestId: 'request-unmount',
  kind: 'unmount',
  status: 'running',
  expectedRevision: 0,
  input: { projectId: PROJECT_ID, repoRoot: '/repo', worktreePath: GONE_PATH },
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

const load = async (state: State) => {
  const set = (updater: Partial<State> | ((current: State) => Partial<State>)) => {
    Object.assign(state, typeof updater === 'function' ? updater(state) : updater);
  };
  return loadSessionMounts(set as never, (() => state) as never)({ sessionId: SESSION_ID });
};

const settledStatus = () => h.operations.get('request-unmount')?.status;

beforeEach(() => {
  vi.clearAllMocks();
  resetMountRecoveryGuard();
  h.mounts.clear();
  h.operations.clear();
  h.inspections.clear();
  h.mounts.set('mount-gone', mountFixture({ id: 'mount-gone', worktreePath: null }));
  h.operations.set('request-unmount', unsettledOperation());
  h.listMountOperations.mockImplementation(async () => [...h.operations.values()]);
  h.upsertMountOperation.mockImplementation(
    async ({ operation }: { readonly operation: MountOperation }) => {
      h.operations.set(operation.requestId, operation);
    },
  );
  h.updateSessionMountLifecycle.mockImplementation(async () => true);
});

describe('loadSessionMounts', () => {
  it('settles an operation left unsettled by a crash once the mounts are hydrated', async () => {
    const state = makeState();

    await load(state);
    await vi.waitFor(() => expect(settledStatus()).toBe('succeeded'));
  });

  it('recovers once per session however often the mounts are hydrated', async () => {
    const state = makeState();

    await load(state);
    await vi.waitFor(() => expect(settledStatus()).toBe('succeeded'));
    await load(state);
    await load(state);

    expect(h.listMountOperations).toHaveBeenCalledTimes(1);
  });

  it('never republishes a mount that hydration could not find on disk', async () => {
    const state = makeState();
    h.mounts.set(
      'mount-unreachable',
      mountFixture({ id: 'mount-unreachable', worktreePath: UNREACHABLE_PATH }),
    );
    h.inspections.set(UNREACHABLE_PATH, {
      kind: 'repository-unavailable',
      path: UNREACHABLE_PATH,
    });

    const views = await load(state);
    await vi.waitFor(() => expect(settledStatus()).toBe('succeeded'));

    const hydrated = views.find((view) => view.id === 'mount-unreachable');
    const published = state['sessionMounts'] as Record<string, ReadonlyArray<SessionMount>>;
    const runnable = state['sessionProjectMounts'] as Record<string, ReadonlyArray<unknown>>;
    expect(hydrated).toMatchObject({ isAttached: false, diskState: 'unchecked' });
    expect(published[SESSION_ID]?.find((view) => view.id === 'mount-unreachable')).toMatchObject({
      isAttached: false,
      diskState: 'unchecked',
    });
    expect(runnable[SESSION_ID]).toEqual([]);
    expect(h.updateSessionMountLifecycle).not.toHaveBeenCalled();
  });
});
