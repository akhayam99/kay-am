// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@goodboy/types';

const { store, useWorktreeStatuses, useWorktreeStatusPending } = vi.hoisted(() => ({
  store: {
    projects: [] as ReadonlyArray<Record<string, unknown>>,
    sessionMounts: {} as Record<string, ReadonlyArray<Record<string, unknown>>>,
    sessionProjectMounts: {} as Record<string, ReadonlyArray<Record<string, unknown>>>,
    mountGithub: {} as Record<string, Record<string, unknown>>,
    mountGitlabMr: {},
    mountBitbucketPr: {},
    mountBranchObservations: {},
    prSeries: {} as Record<string, ReadonlyArray<Record<string, unknown>>>,
    loadSessionMounts: vi.fn(async () => []),
    loadPrSeries: vi.fn(async () => []),
    openMountRequest: vi.fn(async () => undefined),
    attachMount: vi.fn(async () => undefined),
    unmountMount: vi.fn(async () => ({ kept: false, reason: null })),
    setSessionActiveMount: vi.fn(async () => undefined),
    setScriptsLensScope: vi.fn(),
    openMountDiff: vi.fn(),
    emitNotification: vi.fn(),
    detectedEditors: [] as ReadonlyArray<{ binary: string; label: string }>,
    loadDetectedEditors: vi.fn(async () => undefined),
    sessionWorktrees: {},
    terminalTabs: {},
    scriptRuns: {},
    sessionPhaseRuns: {},
    projectScripts: {},
    mountCleanupProposals: {},
    loadMountCleanupProposals: vi.fn(async () => []),
    resolveMountCleanup: vi.fn(async () => undefined),
  },
  useWorktreeStatuses: vi.fn(() => new Map()),
  useWorktreeStatusPending: vi.fn(() => new Set()),
}));

vi.mock('../../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
  useMountDiffStats: () => new Map([['/api-one', { additions: 3, deletions: 1 }]]),
}));
vi.mock('../../../../worktree/useMountRemoteHostKind', () => ({
  useMountRemoteHostKind: () => 'github',
}));
vi.mock('../../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../hooks/useWorktreeStatuses', () => ({
  useWorktreeStatuses,
  useWorktreeStatusPending,
}));
vi.mock('./MountProjectAction', () => ({
  MountProjectAction: () => <button>Mount project</button>,
}));
vi.mock('./ProjectBranchChip', () => ({
  ProjectBranchChip: ({ branch }: { readonly branch: string }) => <span>{branch}</span>,
}));
vi.mock('./ProjectSyncControl', () => ({ ProjectSyncControl: () => null }));
vi.mock('./ProjectDetachMenu', () => ({ ProjectDetachMenu: () => null }));
vi.mock('./NewBranchMountAction', () => ({
  NewBranchMountAction: () => <button>New branch mount</button>,
}));
vi.mock('../EditorMenu', () => ({ EditorMenu: () => null }));
vi.mock('../MountCleanupProposals', () => ({
  MountCleanupProposals: () => null,
}));

import { ProjectMountRows } from '.';

const session = { id: 'session-1', workspaceId: 'workspace-1' } as Session;

type MountParams = {
  readonly id: string;
  readonly branch: string;
  readonly path: string | null;
  readonly isAttached?: boolean;
};

const mountView = ({ id, branch, path, isAttached = true }: MountParams) => ({
  id,
  sessionId: 'session-1',
  projectId: 'api',
  mountName: 'API',
  worktreePath: path,
  lastWorktreePath: path,
  repoRoot: '/repo/api',
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: 'acme/api',
  isAttached,
  diskState: 'present',
  revision: 0,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
});

const githubState = ({ number, state }: { readonly number: number; readonly state: string }) => ({
  pr: {
    number,
    title: `Part ${number}`,
    url: `https://github.com/acme/api/pull/${number}`,
    state,
    isDraft: false,
  },
  repository: 'acme/api',
  host: 'github.com',
});

const seriesOfTwo = () => ({
  id: 'series-1',
  sessionId: 'session-1',
  projectId: 'api',
  name: 'restyle',
  plannedCount: 6,
  workItemIdentifier: null,
  workItemUrl: null,
  parentRequest: null,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
  members: [
    {
      id: 'member-1',
      seriesId: 'series-1',
      mountId: 'mount-1',
      branch: 'feat/one',
      ordinal: 1,
      label: '1/6',
      status: 'active',
      request: { state: 'merged' },
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    },
    {
      id: 'member-2',
      seriesId: 'series-1',
      mountId: 'mount-2',
      branch: 'feat/two',
      ordinal: 2,
      label: '2/6',
      status: 'active',
      request: { state: 'open' },
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    },
  ],
});

describe('ProjectMountRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.projects = [
      {
        id: 'api',
        workspaceId: 'workspace-1',
        name: 'API',
        kind: 'repo',
        rootPath: '/repo/api',
      },
    ];
    store.sessionMounts = {};
    store.sessionProjectMounts = {};
    store.mountGithub = {};
    store.prSeries = {};
  });
  afterEach(cleanup);

  it('gives a project owning a single mount the same header as a project owning several', () => {
    store.projects = [
      ...store.projects,
      { id: 'web', workspaceId: 'workspace-1', name: 'WEB', kind: 'repo', rootPath: '/repo/web' },
    ];
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
        {
          ...mountView({ id: 'mount-3', branch: 'feat/three', path: '/web-one' }),
          projectId: 'web',
        },
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getByRole('list', { name: 'API branch mounts' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'WEB branch mounts' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'New branch mount' })).toHaveLength(2);
    expect(screen.getByRole('listitem', { name: 'WEB on feat/three' })).toBeDefined();
  });

  it('gives each project its own group, separated by rhythm and not by a box', () => {
    store.projects = [
      ...store.projects,
      { id: 'web', workspaceId: 'workspace-1', name: 'WEB', kind: 'repo', rootPath: '/repo/web' },
    ];
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        { ...mountView({ id: 'mount-2', branch: 'feat/two', path: '/web-one' }), projectId: 'web' },
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    const blocks = ['API', 'WEB'].map(
      (name) => screen.getByRole('list', { name: `${name} branch mounts` }).parentElement,
    );

    expect(new Set(blocks).size).toBe(2);
    for (const block of blocks) {
      expect(block).not.toBeNull();
      expect((block as HTMLElement).className).not.toContain('border');
      expect(within(block as HTMLElement).getAllByTestId('project-mount-row')).toHaveLength(1);
    }
    expect(blocks[0]?.parentElement?.className).toContain('gap-6');
  });

  it('renders one row per branch mount of the same project', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    const rows = screen.getAllByTestId('project-mount-row');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'API on feat/one',
      'API on feat/two',
    ]);
  });

  it('gives each row the pull request of its own mount', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    store.mountGithub = {
      'mount-1': githubState({ number: 11, state: 'open' }),
      'mount-2': githubState({ number: 12, state: 'open' }),
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    const [first, second] = screen.getAllByTestId('project-mount-row');
    expect(within(first as HTMLElement).getByText('#11')).toBeDefined();
    expect(within(second as HTMLElement).getByText('#12')).toBeDefined();
  });

  it('creates a request for a row that is not the active mount', async () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create a PR for API on feat/one' }));

    await waitFor(() =>
      expect(store.openMountRequest).toHaveBeenCalledWith({
        sessionId: 'session-1',
        mountId: 'mount-1',
        provider: 'github',
      }),
    );
  });

  it('mounts an unmounted sibling from its own row', async () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: null, isAttached: false }),
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mount API on feat/two' }));

    await waitFor(() =>
      expect(store.attachMount).toHaveBeenCalledWith({
        sessionId: 'session-1',
        mountId: 'mount-2',
      }),
    );
  });

  it('keeps completed mounts behind a count toggle, under the branches still open', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    store.mountGithub = { 'mount-1': githubState({ number: 11, state: 'merged' }) };
    store.prSeries = { 'session-1': [seriesOfTwo()] };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getAllByTestId('project-mount-row')).toHaveLength(1);
    const toggle = screen.getByRole('button', { name: /Show completed \(1\)/ });
    fireEvent.click(toggle);

    const rows = screen.getAllByTestId('project-mount-row');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'API on feat/two',
      'API on feat/one',
    ]);
  });

  it('orders the mounts of a series by the position it declares', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
      ],
    };
    store.prSeries = { 'session-1': [seriesOfTwo()] };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    const rows = screen.getAllByTestId('project-mount-row');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'API on feat/one',
      'API on feat/two',
    ]);
  });

  it('names the split on the group and the part on the row', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    store.prSeries = { 'session-1': [seriesOfTwo()] };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getByText('restyle')).toBeDefined();
    expect(screen.getByText('Part 2/6')).toBeDefined();
    expect(screen.queryByText(/of 6 created/)).toBeNull();
  });

  it('keeps the secondary commands of every row reachable by keyboard', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: '/api-two' }),
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    const terminal = screen.getByRole('button', { name: 'Open terminal for API on feat/two' });
    terminal.focus();

    expect(document.activeElement).toBe(terminal);
  });

  it('keeps an unmounted branch with open work out of the completed disclosure', () => {
    store.sessionMounts = {
      'session-1': [
        mountView({ id: 'mount-1', branch: 'feat/one', path: '/api-one' }),
        mountView({ id: 'mount-2', branch: 'feat/two', path: null, isAttached: false }),
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Completed/ })).toBeNull();
    expect(screen.getAllByTestId('project-mount-row')).toHaveLength(2);
  });

  it('renders a quiet mount action when no project is mounted', () => {
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getByText('Projects')).toBeDefined();
    expect(screen.queryByText('No project mounted yet')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mount project' })).toBeDefined();
    expect(
      screen.getByText('Mount a workspace project to make it available in this session.'),
    ).toBeDefined();
  });

  it('keeps the mount action in the section header when mounts exist', () => {
    store.sessionProjectMounts = {
      'session-1': [
        {
          mountId: 'mount-1',
          projectId: 'api',
          mountName: 'API',
          branch: 'feat/api',
          worktreePath: '/api',
          repoRoot: '/repo/api',
        },
      ],
    };
    render(<ProjectMountRows session={session} onSelectLens={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Mount project' })).toBeDefined();
    expect(screen.getByTestId('project-mount-row')).toBeDefined();
    expect(
      screen.queryByText('Mount a workspace project to make it available in this session.'),
    ).toBeNull();
  });
});
