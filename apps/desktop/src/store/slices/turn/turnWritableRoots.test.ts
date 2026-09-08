import { describe, expect, it, vi } from 'vitest';
import type { ProjectId, SessionProjectMount } from '@goodboy/types';

vi.mock('../../../features/worktree/worktree', () => ({
  gitCommonDirectory: vi.fn(async () => null),
}));

import { buildTurnWritableRoots, repoRootsForTurn } from './turnWritableRoots';

const mount = (overrides: Partial<SessionProjectMount> = {}): SessionProjectMount => ({
  projectId: 'project-api' as ProjectId,
  mountName: 'api',
  worktreePath: '/repo/api/.goodboy/worktrees/first',
  repoRoot: '/repo/api',
  branch: 'goodboy/first',
  ...overrides,
});

const first = mount();
const second = mount({
  mountName: 'api 2',
  worktreePath: '/repo/api/.goodboy/worktrees/second',
  branch: 'goodboy/second',
});

describe('buildTurnWritableRoots', () => {
  it('adds the sibling worktree and the git directory but never their parent', () => {
    const roots = buildTurnWritableRoots({
      mounts: [first, second],
      workingDir: first.worktreePath,
      gitDirs: new Map([['/repo/api', '/repo/api/.git']]),
    });

    expect(roots).toEqual(['/repo/api/.goodboy/worktrees/second', '/repo/api/.git']);
    expect(roots).not.toContain('/repo/api');
    expect(roots).not.toContain('/repo/api/.goodboy/worktrees');
  });

  it('takes the git directory git reports instead of assuming a .git folder', () => {
    const roots = buildTurnWritableRoots({
      mounts: [first],
      workingDir: first.worktreePath,
      gitDirs: new Map([['/repo/api', '/elsewhere/api.git']]),
    });

    expect(roots).toEqual(['/elsewhere/api.git']);
  });

  it('falls back to the conventional git directory when git answered nothing', () => {
    const roots = buildTurnWritableRoots({
      mounts: [first],
      workingDir: '/somewhere/else',
      gitDirs: new Map(),
    });

    expect(roots).toEqual(['/repo/api/.goodboy/worktrees/first', '/repo/api/.git']);
  });

  it('excludes a detached mount and a branchless folder mount', () => {
    const roots = buildTurnWritableRoots({
      mounts: [
        mount({ worktreePath: '/repo/api/.goodboy/worktrees/gone', isAttached: false }),
        mount({
          projectId: 'project-notes' as ProjectId,
          repoRoot: '/repo/notes',
          worktreePath: '/repo/notes/sessions/goal',
          branch: '',
        }),
      ],
      workingDir: '/repo/api/.goodboy/worktrees/first',
      gitDirs: new Map(),
    });

    expect(roots).toEqual([]);
  });
});

describe('repoRootsForTurn', () => {
  it('names each repository once and skips the mounts that cannot be written', () => {
    const roots = repoRootsForTurn({
      mounts: [first, second, mount({ repoRoot: '/repo/web', branch: '' })],
    });

    expect(roots).toEqual(['/repo/api']);
  });
});
