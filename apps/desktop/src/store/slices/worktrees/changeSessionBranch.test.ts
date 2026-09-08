import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';

const MOUNT_ID = 'mount-1' as MountId;
const WORKTREE_PATH = '/repos/goodboy/.goodboy/worktrees/task';

const h = vi.hoisted(() => ({
  listSessionMounts: vi.fn(async () => [
    {
      id: 'mount-1',
      sessionId: 'session-1',
      projectId: 'project-1',
      worktreePath: '/repos/goodboy/.goodboy/worktrees/task',
      lastWorktreePath: '/repos/goodboy/.goodboy/worktrees/task',
      branch: 'ak/outgoing',
      baseBranch: null,
      parallelIndex: 0,
      mountName: 'goodboy',
      repoSlug: null,
      isAttached: true,
      diskState: 'present',
      revision: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]),
  updateSessionMountBranch: vi.fn(async () => true),
  getMountOperation: vi.fn(async () => null),
  upsertMountOperation: vi.fn(async () => undefined),
  changeWorktreeBranch: vi.fn(async () => undefined),
  emitNotification: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/db', () => ({
  listSessionMounts: h.listSessionMounts,
  updateSessionMountBranch: h.updateSessionMountBranch,
  getMountOperation: h.getMountOperation,
  upsertMountOperation: h.upsertMountOperation,
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('../../../features/worktree/worktree', () => ({
  changeWorktreeBranch: h.changeWorktreeBranch,
  invalidateLocalBranchesCache: vi.fn(),
}));

import { changeSessionBranch } from './changeSessionBranch';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;

type State = Record<string, unknown>;

const makeState = (): State => ({
  sessions: [{ id: SESSION_ID, workspaceId: 'workspace-1' }],
  projects: [
    { id: PROJECT_ID, workspaceId: 'workspace-1', kind: 'repo', rootPath: '/repos/goodboy' },
  ],
  sessionBranches: { [SESSION_ID]: 'ak/outgoing' },
  sessionMounts: {},
  mountBranchObservations: {},
  sessionWorktrees: {},
  sessionProjectMounts: {
    [SESSION_ID]: [
      {
        mountId: MOUNT_ID,
        projectId: PROJECT_ID,
        mountName: 'goodboy',
        worktreePath: WORKTREE_PATH,
        repoRoot: '/repos/goodboy',
        branch: 'ak/outgoing',
      },
    ],
  },
  sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
  sessionGithub: { [SESSION_ID]: { pr: { number: 42 } } },
  sessionProjectPrs: { [SESSION_ID]: { [PROJECT_ID]: [{ number: 42 }] } },
  sessionSelectedPrNumber: { [SESSION_ID]: 40 },
  sessionExternalTasks: {
    [SESSION_ID]: [{ provider: 'linear', externalId: 'GB-1', branch: 'ak/outgoing' }],
  },
  emitNotification: h.emitNotification,
  recordSessionEvent: vi.fn(async () => undefined),
});

const runSwitch = async (state: State): Promise<void> => {
  const set = vi.fn((updater: (current: State) => State) => {
    Object.assign(state, updater(state));
  });
  await changeSessionBranch(set as never, (() => state) as never)(SESSION_ID, {
    branch: 'ak/incoming',
    createNew: false,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('changeSessionBranch', () => {
  it('switches the branch of the active mount without notifying anyone', async () => {
    const state = makeState();

    await runSwitch(state);

    expect(h.changeWorktreeBranch).toHaveBeenCalledWith({
      repoPath: '/repos/goodboy',
      worktreePath: WORKTREE_PATH,
      branch: 'ak/incoming',
      createNew: false,
    });
    expect(h.emitNotification).not.toHaveBeenCalled();
  });

  it('writes the branch against the observed mount revision', async () => {
    const state = makeState();

    await runSwitch(state);

    expect(h.updateSessionMountBranch).toHaveBeenCalledWith(
      expect.objectContaining({ mountId: MOUNT_ID, branch: 'ak/incoming', expectedRevision: 3 }),
    );
  });

  it('writes the switch to the session trace with both branch names', async () => {
    const state = makeState();

    await runSwitch(state);

    expect(state['recordSessionEvent']).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      kind: 'branch_switched',
      payload: { from: 'ak/outgoing', to: 'ak/incoming' },
    });
  });

  it('drops the cached pull requests of the outgoing branch', async () => {
    const state = makeState();

    await runSwitch(state);

    expect(state.sessionBranches).toEqual({ [SESSION_ID]: 'ak/incoming' });
    expect(state.sessionGithub).toEqual({});
    expect(state.sessionProjectPrs).toEqual({ [SESSION_ID]: {} });
    expect(state.sessionSelectedPrNumber).toEqual({});
  });
});
