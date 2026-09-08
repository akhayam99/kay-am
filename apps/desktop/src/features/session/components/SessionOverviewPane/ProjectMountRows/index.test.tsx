// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@goodboy/types';

const { store, useWorktreeStatuses, useWorktreeStatusPending } = vi.hoisted(() => ({
  store: {
    projects: [] as ReadonlyArray<{ id: string; workspaceId: string; name: string }>,
    sessionProjectMounts: {} as Record<
      string,
      ReadonlyArray<{ projectId: string; mountName: string; branch: string; worktreePath: string }>
    >,
    sessionProjectPrs: {},
  },
  useWorktreeStatuses: vi.fn(() => new Map()),
  useWorktreeStatusPending: vi.fn(() => new Set()),
}));

vi.mock('../../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
  useMountDiffStats: () => new Map(),
}));
vi.mock('./ProjectMountRow', () => ({
  ProjectMountRow: ({ mount }: { readonly mount: { readonly mountName: string } }) => (
    <div data-testid="project-mount-row">{mount.mountName}</div>
  ),
}));
vi.mock('../../../hooks/useWorktreeStatuses', () => ({
  useWorktreeStatuses,
  useWorktreeStatusPending,
}));
vi.mock('./MountProjectAction', () => ({
  MountProjectAction: () => <button>Mount project</button>,
}));
vi.mock('../MountCleanupProposals', () => ({
  MountCleanupProposals: () => null,
}));

import { ProjectMountRows } from '.';

const session = { id: 'session-1', workspaceId: 'workspace-1' } as Session;

describe('ProjectMountRows', () => {
  beforeEach(() => {
    store.projects = [];
    store.sessionProjectMounts = {};
    useWorktreeStatuses.mockClear();
  });
  afterEach(cleanup);

  it('polls all mounted worktrees through one shared hook call', () => {
    store.sessionProjectMounts = {
      'session-1': [
        { projectId: 'api', mountName: 'API', branch: 'feat/api', worktreePath: '/api' },
        { projectId: 'web', mountName: 'Web', branch: 'feat/web', worktreePath: '/web' },
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(useWorktreeStatuses).toHaveBeenCalledTimes(1);
    expect(useWorktreeStatuses).toHaveBeenCalledWith({
      targets: [
        { worktreePath: '/api', baseBranch: undefined },
        { worktreePath: '/web', baseBranch: undefined },
      ],
    });
  });

  it('renders one row per mount in mount order', () => {
    store.sessionProjectMounts = {
      'session-1': [
        { projectId: 'api', mountName: 'API', branch: 'feat/api', worktreePath: '/api' },
        { projectId: 'web', mountName: 'Web', branch: 'feat/web', worktreePath: '/web' },
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getAllByTestId('project-mount-row').map((row) => row.textContent)).toEqual([
      'API',
      'Web',
    ]);
  });

  it('renders a quiet mount action when no project is mounted', () => {
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getByText('No project mounted yet')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mount project' })).toBeDefined();
  });
});
