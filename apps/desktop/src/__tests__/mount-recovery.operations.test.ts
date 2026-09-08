import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, MountOperation, ProjectId, SessionId, SessionMount } from '@goodboy/types';

const h = vi.hoisted(() => ({
  mounts: new Map<string, SessionMount>(),
  operations: new Map<string, MountOperation>(),
  inspection: { kind: 'registered', path: '/worktree', isMain: false } as Record<string, unknown>,
}));

vi.mock('../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../features/worktree/worktree', () => ({
  inspectWorktree: vi.fn(async () => h.inspection),
  worktreeStatus: vi.fn(async () => ({
    workingTree: {
      kind: 'known',
      staged: 0,
      unstaged: 0,
      untracked: 0,
      unmerged: 0,
      changed: 0,
    },
    inProgress: null,
  })),
  changeWorktreeBranch: vi.fn(async () => undefined),
  invalidateLocalBranchesCache: vi.fn(),
  listBranchNames: vi.fn(async () => ['feature/one', 'feature/raw-checkout']),
  createWorktree: vi.fn(
    async ({
      parentDir,
      dirName,
      existingBranch,
      branchPrefix,
      slug,
    }: {
      readonly parentDir: string;
      readonly dirName: string;
      readonly existingBranch?: string;
      readonly branchPrefix: string;
      readonly slug: string;
    }) => ({
      worktreePath: `${parentDir}/${dirName}`,
      branchName: existingBranch ?? `${branchPrefix}/${slug}`,
      slug,
      reused: false,
    }),
  ),
}));
vi.mock('@goodboy/db', () => ({
  listSessionMounts: vi.fn(async () => [...h.mounts.values()]),
  listMountOperations: vi.fn(async () => [...h.operations.values()]),
  getMountOperation: vi.fn(
    async ({ requestId }: { readonly requestId: string }) => h.operations.get(requestId) ?? null,
  ),
  insertSessionMount: vi.fn(async ({ mount }: { readonly mount: SessionMount }) => {
    h.mounts.set(mount.id, mount);
  }),
  updateSessionMountLifecycle: vi.fn(
    async ({
      mountId,
      worktreePath,
      isAttached,
      diskState,
      expectedRevision,
    }: {
      readonly mountId: MountId;
      readonly worktreePath: string | null;
      readonly isAttached: boolean;
      readonly diskState: SessionMount['diskState'];
      readonly expectedRevision: number;
    }) => {
      const mount = h.mounts.get(mountId);
      if (mount === undefined || mount.revision !== expectedRevision) {
        return false;
      }
      h.mounts.set(mountId, {
        ...mount,
        worktreePath,
        lastWorktreePath: worktreePath ?? mount.worktreePath ?? mount.lastWorktreePath,
        isAttached,
        diskState,
        revision: mount.revision + 1,
      });
      return true;
    },
  ),
  updateSessionMountBranch: vi.fn(
    async ({
      mountId,
      branch,
      expectedRevision,
    }: {
      readonly mountId: MountId;
      readonly branch: string;
      readonly expectedRevision: number;
    }) => {
      const mount = h.mounts.get(mountId);
      if (mount === undefined || mount.revision !== expectedRevision) {
        return false;
      }
      h.mounts.set(mountId, { ...mount, branch, revision: mount.revision + 1 });
      return true;
    },
  ),
  upsertMountOperation: vi.fn(async ({ operation }: { readonly operation: MountOperation }) => {
    h.operations.set(operation.requestId, operation);
  }),
}));

import { recoverMountOperations } from '../store/slices/project-mounts/recoverMountOperations';
import { createProjectMountsSlice } from '../store/slices/project-mounts';
import { recordMountBranchObservation } from '../store/slices/project-mounts/mountBranchObservations';
import { loadSessionMounts } from '../store/slices/project-mounts/loadSessionMounts';
import { verifyAvailableWorktrees } from '../store/slices/project-mounts/verifyAvailableWorktrees';

const SESSION_ID = 'session-recovery' as SessionId;
const PROJECT_ID = 'project-recovery' as ProjectId;
const NOW = '2026-09-08T10:00:00.000Z' as SessionMount['createdAt'];

const mountFixture = ({
  id = 'mount-one',
  path = '/repo/.goodboy/worktrees/mount-one' as string | null,
  revision = 0,
}: {
  readonly id?: string;
  readonly path?: string | null;
  readonly revision?: number;
} = {}): SessionMount => ({
  id: id as MountId,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  worktreePath: path,
  lastWorktreePath: path,
  branch: 'feature/one',
  baseBranch: 'main',
  parallelIndex: 1,
  mountName: 'API',
  repoSlug: 'acme/api',
  isAttached: path !== null,
  diskState: path === null ? 'removed' : 'present',
  revision,
  createdAt: NOW,
  updatedAt: NOW,
});

const operationFixture = ({
  kind,
  status = 'uncertain',
  result,
}: {
  readonly kind: MountOperation['kind'];
  readonly status?: MountOperation['status'];
  readonly result: unknown | null;
}): MountOperation => ({
  id: `operation-${kind}`,
  sessionId: SESSION_ID,
  mountId: 'mount-one' as MountId,
  requestId: `request-${kind}`,
  kind,
  status,
  expectedRevision: 0,
  input: {
    projectId: PROJECT_ID,
    repoRoot: '/repo',
    worktreePath: '/repo/.goodboy/worktrees/mount-one',
  },
  result,
  errorCode: 'unknown-state',
  createdAt: NOW,
  updatedAt: NOW,
});

type State = Record<string, unknown>;

const makeState = (): State => ({
  projects: [
    {
      id: PROJECT_ID,
      workspaceId: 'workspace-recovery',
      name: 'API',
      rootPath: '/repo',
      kind: 'repo',
      baseBranch: 'main',
      overrides: {},
    },
  ],
  sessions: [
    {
      id: SESSION_ID,
      workspaceId: 'workspace-recovery',
      goal: 'Split ENG-3240',
      providerPreference: { defaultProvider: 'claude' },
    },
  ],
  workspaceOverrides: {},
  sessionExternalTasks: {},
  sessionMounts: {},
  sessionProjectMounts: {},
  sessionActiveMount: {},
  sessionActiveProject: {},
  sessionBranches: {},
  sessionWorktrees: {},
  mountBranchObservations: {},
  mountGithub: {},
  mountSelectedPr: {},
  mountGitlabMr: {},
  mountBitbucketPr: {},
  mountSelectedBitbucketPr: {},
  recordSessionEvent: vi.fn(async () => undefined),
});

const recovery = () => {
  const state = makeState();
  const set = (updater: Partial<State> | ((current: State) => Partial<State>)) => {
    Object.assign(state, typeof updater === 'function' ? updater(state) : updater);
  };
  return recoverMountOperations(set as never, (() => state) as never);
};

beforeEach(() => {
  h.mounts.clear();
  h.operations.clear();
  h.inspection = { kind: 'registered', path: '/worktree', isMain: false };
});

describe('interrupted mount recovery', () => {
  it('finalizes a fork whose worktree exists and makes retry a no-op', async () => {
    h.operations.set(
      'request-fork',
      operationFixture({
        kind: 'fork',
        result: {
          mountId: 'mount-one',
          worktreePath: '/repo/.goodboy/worktrees/mount-one',
          branch: 'feature/one',
          repoRoot: '/repo',
        },
      }),
    );
    const runRecovery = recovery();

    const first = await runRecovery({ sessionId: SESSION_ID });
    const second = await runRecovery({ sessionId: SESSION_ID });

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect([...h.mounts.keys()]).toEqual(['mount-one']);
    expect(h.operations.get('request-fork')).toMatchObject({
      status: 'succeeded',
      result: { mountId: 'mount-one', branch: 'feature/one' },
    });
  });

  it('finalizes an unmount after the directory disappeared but before the row changed', async () => {
    h.mounts.set('mount-one', mountFixture());
    h.operations.set('request-unmount', operationFixture({ kind: 'unmount', result: null }));
    h.inspection = { kind: 'missing', path: '/repo/.goodboy/worktrees/mount-one' };

    const settled = await recovery()({ sessionId: SESSION_ID });

    expect(settled).toBe(1);
    expect(h.mounts.get('mount-one')).toMatchObject({
      worktreePath: null,
      lastWorktreePath: '/repo/.goodboy/worktrees/mount-one',
      isAttached: false,
      diskState: 'removed',
    });
    expect(h.operations.get('request-unmount')?.status).toBe('succeeded');
  });

  it('leaves an approval-gated cleanup proposal pending across restart', async () => {
    h.mounts.set('mount-one', mountFixture());
    h.operations.set(
      'request-remove',
      operationFixture({ kind: 'remove', status: 'pending', result: null }),
    );

    const settled = await recovery()({ sessionId: SESSION_ID });

    expect(settled).toBe(0);
    expect(h.operations.get('request-remove')?.status).toBe('pending');
  });

  it('marks a nonexistent seeded path unavailable before hydration or restoration projects it', async () => {
    const mount = mountFixture();
    h.mounts.set('mount-one', mount);
    h.inspection = { kind: 'missing', path: mount.worktreePath };

    const available = await verifyAvailableWorktrees({
      sessionId: SESSION_ID,
      candidates: [
        {
          id: mount.id,
          projectId: PROJECT_ID,
          worktreePath: mount.worktreePath ?? '',
          revision: mount.revision,
        },
      ],
      projects: makeState()['projects'] as never,
    });

    expect(available).toEqual([]);
    expect(h.mounts.get('mount-one')).toMatchObject({
      worktreePath: null,
      isAttached: false,
      diskState: 'missing',
    });
  });

  it('does not expose a mount as runnable while its repository cannot be inspected', async () => {
    h.mounts.set('mount-one', mountFixture());
    h.inspection = {
      kind: 'repository-unavailable',
      path: '/repo/.goodboy/worktrees/mount-one',
    };
    const state = makeState();
    const set = (updater: Partial<State> | ((current: State) => Partial<State>)) => {
      Object.assign(state, typeof updater === 'function' ? updater(state) : updater);
    };

    const views = await loadSessionMounts(
      set as never,
      (() => state) as never,
    )({
      sessionId: SESSION_ID,
    });

    expect(views[0]).toMatchObject({ isAttached: false, diskState: 'unchecked' });
    expect(state['sessionProjectMounts']).toEqual({ [SESSION_ID]: [] });
  });
});

describe('raw checkout recovery', () => {
  const makeMountSlice = () => {
    const state = makeState();
    const set = (updater: Partial<State> | ((current: State) => Partial<State>)) => {
      Object.assign(state, typeof updater === 'function' ? updater(state) : updater);
    };
    const slice = createProjectMountsSlice(set as never, (() => state) as never);
    return { state, set, slice };
  };

  const observeRawCheckout = ({ state, set }: ReturnType<typeof makeMountSlice>) => {
    recordMountBranchObservation({
      set: set as never,
      sessionId: SESSION_ID,
      mountId: 'mount-one' as MountId,
      recordedBranch: 'feature/one',
      observedBranch: 'feature/raw-checkout',
      worktreePath: '/repo/.goodboy/worktrees/mount-one',
      revision: 0,
    });
    return state;
  };

  it('records unexpected HEAD without changing persisted branch ownership', () => {
    h.mounts.set('mount-one', mountFixture());
    const fixture = makeMountSlice();

    const state = observeRawCheckout(fixture);

    expect(h.mounts.get('mount-one')?.branch).toBe('feature/one');
    expect(state['mountBranchObservations']).toMatchObject({
      [SESSION_ID]: [{ state: 'mismatch', observedBranch: 'feature/raw-checkout' }],
    });
  });

  it('adopts a raw checkout in place when the declared intent is switch', async () => {
    h.mounts.set('mount-one', mountFixture());
    const fixture = makeMountSlice();
    observeRawCheckout(fixture);

    const resolved = await fixture.slice.resolveMountBranchMismatch({
      sessionId: SESSION_ID,
      mountId: 'mount-one' as MountId,
      resolution: 'adopt-observed',
    });

    expect(resolved).toMatchObject({
      id: 'mount-one',
      branch: 'feature/raw-checkout',
      worktreePath: '/repo/.goodboy/worktrees/mount-one',
    });
    expect(h.mounts.size).toBe(1);
  });

  it('restores the recorded branch beside the raw checkout when the intent is fork', async () => {
    h.mounts.set('mount-one', mountFixture());
    const fixture = makeMountSlice();
    observeRawCheckout(fixture);

    await fixture.slice.resolveMountBranchMismatch({
      sessionId: SESSION_ID,
      mountId: 'mount-one' as MountId,
      resolution: 'keep-both',
    });

    expect([...h.mounts.values()].map((mount) => mount.branch).sort()).toEqual([
      'feature/one',
      'feature/raw-checkout',
    ]);
    expect(new Set([...h.mounts.values()].map((mount) => mount.worktreePath)).size).toBe(2);
  });
});
