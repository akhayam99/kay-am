import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';

const WORKTREE_PATH = '/repos/goodboy/.goodboy/worktrees/task';
const MOUNT_ID = 'mount-1' as MountId;

const h = vi.hoisted(() => ({
  emitNotification: vi.fn(async () => undefined),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import { reconcileSessionBranch } from './reconcileSessionBranch';

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
  sessionProjectMounts: {
    [SESSION_ID]: [
      {
        mountId: MOUNT_ID,
        projectId: PROJECT_ID,
        mountName: 'goodboy',
        worktreePath: WORKTREE_PATH,
        repoRoot: '/repos/goodboy',
        branch: 'ak/outgoing',
        revision: 2,
      },
    ],
  },
  sessionWorktrees: { [SESSION_ID]: [WORKTREE_PATH] },
  sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
  sessionGithub: { [SESSION_ID]: { pr: { number: 42 } } },
  sessionProjectPrs: { [SESSION_ID]: { [PROJECT_ID]: [{ number: 42 }] } },
  sessionSelectedPrNumber: { [SESSION_ID]: 40 },
  sessionExternalTasks: { [SESSION_ID]: [] },
  emitNotification: h.emitNotification,
});

const observe = async (state: State, observedBranch: string): Promise<void> => {
  const set = vi.fn((updater: (current: State) => State) => {
    Object.assign(state, updater(state));
  });
  await reconcileSessionBranch(set as never, (() => state) as never)(SESSION_ID, observedBranch);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcileSessionBranch', () => {
  it('records a mismatch against the mount without rewriting the branch', async () => {
    const state = makeState();

    await observe(state, 'ak/incoming');

    expect(state.mountBranchObservations).toEqual({
      [SESSION_ID]: [
        expect.objectContaining({
          mountId: MOUNT_ID,
          state: 'mismatch',
          recordedBranch: 'ak/outgoing',
          observedBranch: 'ak/incoming',
          revision: 2,
        }),
      ],
    });
    expect(state.sessionBranches).toEqual({ [SESSION_ID]: 'ak/outgoing' });
  });

  it('keeps every pull request association through repeated observations', async () => {
    const state = makeState();

    await observe(state, 'ak/incoming');
    await observe(state, 'ak/incoming');

    expect(state.sessionProjectPrs).toEqual({ [SESSION_ID]: { [PROJECT_ID]: [{ number: 42 }] } });
    expect(state.sessionSelectedPrNumber).toEqual({ [SESSION_ID]: 40 });
    expect(state.sessionGithub).toEqual({ [SESSION_ID]: { pr: { number: 42 } } });
  });

  it('records a detached head when no branch is observed', async () => {
    const state = makeState();

    await observe(state, '   ');

    expect(state.mountBranchObservations).toEqual({
      [SESSION_ID]: [expect.objectContaining({ state: 'detached', observedBranch: null })],
    });
  });

  it('clears the observation when the observed branch matches again', async () => {
    const state = makeState();

    await observe(state, 'ak/incoming');
    await observe(state, 'ak/outgoing');

    expect(state.mountBranchObservations).toEqual({ [SESSION_ID]: [] });
    expect(h.emitNotification).not.toHaveBeenCalled();
  });
});
