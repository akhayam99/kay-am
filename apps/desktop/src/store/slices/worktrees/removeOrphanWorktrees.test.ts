import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteRetainedWorktreePath, removeOrphanWorktree } = vi.hoisted(() => ({
  deleteRetainedWorktreePath: vi.fn(async () => undefined),
  removeOrphanWorktree: vi.fn(async () => undefined),
}));

vi.mock('@goodboy/db', () => ({ deleteRetainedWorktreePath }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({ removeOrphanWorktree }));

import { removeOrphanWorktrees } from './removeOrphanWorktrees';

const makeStore = () => ({
  projects: [
    { id: 'project-1', workspaceId: 'ws-1', name: 'demo', rootPath: '/repo', kind: 'repo' },
  ],
  orphanWorktrees: {
    'ws-1': [
      {
        path: '/repo/.goodboy/worktrees/gb-ghost',
        name: 'gb-ghost',
        sizeBytes: 4096,
        isRegistered: false,
      },
      {
        path: '/other/.goodboy/worktrees/gb-stray',
        name: 'gb-stray',
        sizeBytes: 2048,
        isRegistered: false,
      },
    ],
  },
  retainedWorktreePaths: {},
});

type Store = ReturnType<typeof makeStore>;

const run = async (store: Store, paths: ReadonlyArray<string>) => {
  const set = vi.fn((updater: unknown) => {
    const patch =
      typeof updater === 'function' ? (updater as (s: Store) => object)(store) : updater;
    Object.assign(store, patch);
  });
  const get = (() => store) as never;
  await removeOrphanWorktrees(set as never, get)({ workspaceId: 'ws-1' as never, paths });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removing orphan worktrees', () => {
  it('reports a path no project owns and removes an owned sibling in the same call', async () => {
    const store = makeStore();

    await expect(
      run(store, ['/repo/.goodboy/worktrees/gb-ghost', '/other/.goodboy/worktrees/gb-stray']),
    ).rejects.toThrow('no repository owns /other/.goodboy/worktrees/gb-stray');

    expect(removeOrphanWorktree).toHaveBeenCalledTimes(1);
    expect(removeOrphanWorktree).toHaveBeenCalledWith({
      repoPath: '/repo',
      path: '/repo/.goodboy/worktrees/gb-ghost',
    });
    expect(store.orphanWorktrees).toEqual({
      'ws-1': [
        {
          path: '/other/.goodboy/worktrees/gb-stray',
          name: 'gb-stray',
          sizeBytes: 2048,
          isRegistered: false,
        },
      ],
    });
  });
});
