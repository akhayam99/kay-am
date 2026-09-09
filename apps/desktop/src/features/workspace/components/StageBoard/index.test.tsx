// @vitest-environment happy-dom

import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Project, Session, Workspace, WorkspaceGitStatus, WorkspaceId } from '@goodboy/types';

const { state, gitStatuses, groups } = vi.hoisted(() => ({
  state: {
    boardReady: true,
    archivedSessions: {} as Record<string, ReadonlyArray<Session>>,
    loadArchivedSessions: vi.fn(),
    workspaces: [] as ReadonlyArray<Workspace>,
    projects: [] as ReadonlyArray<Project>,
    bulkUnarchiveTask: vi.fn(async () => undefined),
  },
  gitStatuses: { current: {} as Record<string, WorkspaceGitStatus | null> },
  groups: { current: [] as ReadonlyArray<{ key: string; sessions: ReadonlyArray<Session> }> },
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: [],
  useAppStore: (selector: (s: typeof state) => unknown) => selector(state),
  useStageGroupedSessions: () => groups.current,
  useProjectFilteredSessions: ({ sessions }: { sessions: ReadonlyArray<Session> }) => sessions,
}));

vi.mock('../../hooks/useProjectGitStatuses', () => ({
  useProjectGitStatuses: () =>
    state.projects
      .filter((project) => project.kind === 'repo')
      .map((project) => ({ project, status: gitStatuses.current[project.id] ?? null })),
}));

vi.mock('../../../onboarding/OnboardingWizard/steps/ProjectsStep', () => ({
  ProjectsStep: ({ workspace }: { workspace: Workspace }) => (
    <div data-testid="projects-step">{workspace.name}</div>
  ),
}));

vi.mock('../ProjectGitPill', () => ({
  ProjectGitPills: ({
    entries,
  }: {
    entries: ReadonlyArray<{ project: Project; status: WorkspaceGitStatus | null }>;
  }) => (
    <div data-testid="git-pills">
      {(entries.length >= 3 ? entries.slice(0, 1) : entries).map(({ project, status }) => (
        <span key={project.id} data-testid="git-pill">
          {entries.length >= 3
            ? `${entries.length} repos`
            : `${project.name}:${status?.state ?? 'loading'}`}
        </span>
      ))}
    </div>
  ),
}));

vi.mock('../ProjectFilter', () => ({
  ProjectFilter: () => <span data-testid="project-filter" />,
}));

vi.mock('./useBoardNavigation', () => ({
  useBoardNavigation: () => ({ restore: vi.fn() }),
}));

vi.mock('./StageColumn', () => ({
  StageColumn: ({
    spec,
    sessions,
    selection,
  }: {
    spec: { kind: string; stage?: string };
    sessions: ReadonlyArray<Session>;
    selection: {
      handleItemClick: (id: string, event: { altKey: boolean }) => void;
    };
  }) => (
    <div data-testid="stage-column">
      {spec.kind === 'stage' ? spec.stage : 'archived'}
      {sessions.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-select-id={entry.id}
          aria-label={`card ${entry.id}`}
          onClick={(event) => selection.handleItemClick(entry.id, event)}
        />
      ))}
    </div>
  ),
}));

vi.mock('../../../session/components/ArchiveSessionConfirm', () => ({
  ArchiveSessionConfirm: () => null,
}));
vi.mock('../../../session/components/DeleteSessionConfirm', () => ({
  DeleteSessionConfirm: () => null,
}));
vi.mock('../../../../shared/components/DogMascot', () => ({ DogMascot: () => <div /> }));

vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  return {
    ...actual,
    Tooltip: ({ content, children }: { content: string; children: ReactElement }) => (
      <span data-tooltip={content}>{children}</span>
    ),
  };
});

import { StageBoard } from './index';

const session = { id: 's-1' } as Session;
const wsId = 'ws-a' as WorkspaceId;

const workspace = {
  id: wsId,
  name: 'fresh-idea',
  slug: 'fresh-idea',
  sessionsRoot: '/tmp/fresh-idea',
} as Workspace;

const boxOf = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

const statusOf = (state: WorkspaceGitStatus['state']): WorkspaceGitStatus => ({
  state,
  branch: null,
  headSubject: null,
  upstreamDistance: { kind: 'unknown', reason: 'no-upstream' },
  workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
  upstream: null,
  inProgress: null,
});

const projectOf = ({
  id,
  kind = 'repo',
  name = id,
}: {
  readonly id: string;
  readonly kind?: Project['kind'];
  readonly name?: string;
}): Project => ({ id, workspaceId: wsId, kind, name, rootPath: `/tmp/${id}` }) as Project;

beforeEach(() => {
  state.boardReady = true;
  state.archivedSessions = { [wsId]: [] };
  state.loadArchivedSessions = vi.fn();
  state.workspaces = [workspace];
  state.projects = [projectOf({ id: 'proj-1', name: 'fresh-idea' })];
  gitStatuses.current = { 'proj-1': statusOf('ready') };
  groups.current = [];
});
afterEach(cleanup);

describe('StageBoard loading gate', () => {
  it('shows the skeleton board while boardReady is false, hiding columns and empty state', () => {
    state.boardReady = false;
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    expect(screen.getByLabelText('Loading board')).toBeDefined();
    expect(screen.queryByTestId('stage-column')).toBeNull();
    expect(screen.queryByText('Start your first session')).toBeNull();
  });

  it('renders the empty state once ready with no sessions', () => {
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.queryByLabelText('Loading board')).toBeNull();
    expect(screen.getByText('Start your first session')).toBeDefined();
    expect(screen.getByText('Stage board')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(2);
  });

  it('renders stage columns once ready with sessions', () => {
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    expect(screen.queryByLabelText('Loading board')).toBeNull();
    expect(screen.getAllByTestId('stage-column').length).toBeGreaterThan(0);
    expect(screen.getByText('Stage board')).toBeDefined();
    expect(screen.getByTestId('project-filter')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'New session' })).toHaveLength(1);
  });

  it('renders the board with the archived column instead of the hero when only archived sessions exist', () => {
    const shelved = { id: 's-9' } as Session;
    state.archivedSessions = { [wsId]: [shelved] };
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.queryByText('Start your first session')).toBeNull();
    expect(screen.getByText('Stage board')).toBeDefined();
    const columns = screen.getAllByTestId('stage-column');
    expect(columns.some((column) => column.textContent?.includes('archived'))).toBe(true);
    expect(screen.getByRole('button', { name: 'card s-9' })).toBeDefined();
  });

  it('holds the skeleton instead of the hero while the archived list is still unknown', () => {
    state.archivedSessions = {};
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.getByLabelText('Loading board')).toBeDefined();
    expect(screen.queryByText('Start your first session')).toBeNull();
  });
});

describe('StageBoard empty-projects gate', () => {
  it('leads with the add-projects surface instead of session creation when no project exists', () => {
    state.projects = [];
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.getByTestId('projects-step').textContent).toBe('fresh-idea');
    expect(screen.queryByText('Start your first session')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull();
  });

  it('disables New session with the reason while sessions exist but no project does', () => {
    state.projects = [];
    groups.current = [{ key: 'building', sessions: [session] }];
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    const button = screen.getByRole('button', { name: 'New session' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(
      'Link a project first',
    );
    expect(screen.queryByTestId('projects-step')).toBeNull();
  });

  it('flips back to the session-first empty state once a project lands', () => {
    state.projects = [];
    const { rerender } = render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.getByTestId('projects-step')).toBeDefined();

    state.projects = [projectOf({ id: 'proj-1' })];
    gitStatuses.current = { 'proj-1': statusOf('ready') };
    rerender(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.queryByTestId('projects-step')).toBeNull();
    expect(screen.getByText('Start your first session')).toBeDefined();
  });
});

describe('StageBoard git gate', () => {
  it('renders one pill per repo project and no pill for a folder project', () => {
    state.projects = [
      projectOf({ id: 'repo-a', name: 'Alpha' }),
      projectOf({ id: 'folder-a', kind: 'folder', name: 'Notes' }),
      projectOf({ id: 'repo-b', name: 'Beta' }),
    ];
    gitStatuses.current = {
      'repo-a': statusOf('ready'),
      'repo-b': statusOf('absent'),
    };
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.getAllByTestId('git-pill')).toHaveLength(2);
    expect(screen.getByText('Alpha:ready')).toBeDefined();
    expect(screen.getByText('Beta:absent')).toBeDefined();
    expect(screen.queryByText(/Notes:/)).toBeNull();
  });

  it('renders one aggregate pill for three repo projects', () => {
    state.projects = [
      projectOf({ id: 'repo-a' }),
      projectOf({ id: 'repo-b' }),
      projectOf({ id: 'repo-c' }),
    ];
    gitStatuses.current = {
      'repo-a': statusOf('ready'),
      'repo-b': statusOf('ready'),
      'repo-c': statusOf('ready'),
    };
    render(<StageBoard workspaceId={wsId} sessions={[]} />);
    expect(screen.getAllByTestId('git-pill')).toHaveLength(1);
    expect(screen.getByText('3 repos')).toBeDefined();
  });

  it('blocks New session when the only repo project is absent', () => {
    gitStatuses.current = { 'proj-1': statusOf('absent') };
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    const button = screen.getByRole('button', { name: 'New session' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(
      'This project needs a git repository with one commit first',
    );
  });

  it('enables New session when one repo is ready even if another repo is broken', () => {
    state.projects = [projectOf({ id: 'proj-1' }), projectOf({ id: 'proj-2' })];
    gitStatuses.current = { 'proj-1': statusOf('ready'), 'proj-2': statusOf('missing') };
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    const button = screen.getByRole('button', { name: 'New session' });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.closest('[data-tooltip]')).toBeNull();
  });

  it('enables New session when a folder project is available', () => {
    state.projects = [projectOf({ id: 'folder-a', kind: 'folder' })];
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    expect(screen.getByRole('button', { name: 'New session' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('reports a status read in progress instead of the setup reason while loading', () => {
    gitStatuses.current = {};
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    const button = screen.getByRole('button', { name: 'New session' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(
      'Reading git status',
    );
  });

  it('uses the unreachable reason when all repo projects are missing', () => {
    gitStatuses.current = { 'proj-1': statusOf('missing') };
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    expect(
      screen
        .getByRole('button', { name: 'New session' })
        .closest('[data-tooltip]')
        ?.getAttribute('data-tooltip'),
    ).toBe('The project folder is unreachable');
  });
});

describe('StageBoard instant create', () => {
  it('dispatches the new-session event from the board header button', () => {
    const listener = vi.fn();
    window.addEventListener('goodboy:new-session', listener);
    groups.current = [{ key: 'building', sessions: [session] }];
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);

    fireEvent.click(screen.getByRole('button', { name: 'New session' }));

    expect(listener).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).toBeNull();
    window.removeEventListener('goodboy:new-session', listener);
  });

  it('dispatches the new-session event from the empty-board button', () => {
    const listener = vi.fn();
    window.addEventListener('goodboy:new-session', listener);
    render(<StageBoard workspaceId={wsId} sessions={[]} />);

    const buttons = screen.getAllByRole('button', { name: 'New session' });
    const emptyStateButton = buttons[1];
    if (emptyStateButton == null) {
      throw new Error('Expected the empty state session button');
    }
    fireEvent.click(emptyStateButton);

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('goodboy:new-session', listener);
  });
});

describe('StageBoard selection', () => {
  const other = { id: 's-2' } as Session;
  const shelved = { id: 's-9' } as Session;

  it('never renders a standing selection hint', () => {
    groups.current = [{ key: 'building', sessions: [session] }];
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);
    expect(screen.queryByText(/lasso/)).toBeNull();

    cleanup();
    groups.current = [{ key: 'building', sessions: [session, other] }];
    render(<StageBoard workspaceId={wsId} sessions={[session, other]} />);
    expect(screen.queryByText(/lasso/)).toBeNull();
  });

  it('raises a single bulk bar for the whole board, not one per column', () => {
    groups.current = [{ key: 'building', sessions: [session, other] }];
    render(<StageBoard workspaceId={wsId} sessions={[session, other]} />);
    expect(screen.queryByText(/selected/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'card s-1' }), { altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'card s-2' }), { altKey: true });

    expect(screen.getAllByText('2 selected')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Archive \(2\)$/ })).toBeDefined();
  });

  it('selects every card a lasso drag crosses, across columns', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    groups.current = [
      { key: 'building', sessions: [session] },
      { key: 'review', sessions: [other] },
    ];
    render(<StageBoard workspaceId={wsId} sessions={[session, other]} />);

    const cardA = screen.getByRole('button', { name: 'card s-1' });
    const cardB = screen.getByRole('button', { name: 'card s-2' });
    const columns = cardA.closest('[data-testid="stage-column"]')?.parentElement as HTMLElement;
    columns.getBoundingClientRect = () => boxOf(0, 0, 500, 500);
    cardA.getBoundingClientRect = () => boxOf(10, 10, 100, 40);
    cardB.getBoundingClientRect = () => boxOf(200, 10, 100, 40);

    fireEvent.pointerDown(columns, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent(
      window,
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 400,
        clientY: 100,
        bubbles: true,
      }),
    );

    expect(screen.getByText('2 selected')).toBeDefined();

    fireEvent(window, new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(screen.getByText('2 selected')).toBeDefined();
  });

  it('leaves the cards a lasso drag misses untouched', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    groups.current = [{ key: 'building', sessions: [session, other] }];
    render(<StageBoard workspaceId={wsId} sessions={[session, other]} />);

    const cardA = screen.getByRole('button', { name: 'card s-1' });
    const columns = cardA.closest('[data-testid="stage-column"]')?.parentElement as HTMLElement;
    columns.getBoundingClientRect = () => boxOf(0, 0, 500, 500);
    cardA.getBoundingClientRect = () => boxOf(10, 300, 100, 40);
    screen.getByRole('button', { name: 'card s-2' }).getBoundingClientRect = () =>
      boxOf(10, 400, 100, 40);

    fireEvent.pointerDown(columns, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent(
      window,
      new PointerEvent('pointermove', { pointerId: 1, clientX: 400, clientY: 100, bubbles: true }),
    );

    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('never mixes the archived scope with the active one', () => {
    groups.current = [{ key: 'building', sessions: [session] }];
    state.archivedSessions = { [wsId]: [shelved] };
    render(<StageBoard workspaceId={wsId} sessions={[session]} />);

    fireEvent.click(screen.getByRole('button', { name: 'card s-1' }), { altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'card s-9' }), { altKey: true });

    expect(screen.getByText('1 selected')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Restore \(1\)$/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Archive/ })).toBeNull();
  });

  it('keeps the active-lane hits when a lasso spans into the archived column', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    groups.current = [
      { key: 'building', sessions: [session] },
      { key: 'review', sessions: [other] },
    ];
    state.archivedSessions = { [wsId]: [shelved] };
    render(<StageBoard workspaceId={wsId} sessions={[session, other]} />);

    const cardA = screen.getByRole('button', { name: 'card s-1' });
    const cardB = screen.getByRole('button', { name: 'card s-2' });
    const cardShelved = screen.getByRole('button', { name: 'card s-9' });
    const columns = cardA.closest('[data-testid="stage-column"]')?.parentElement as HTMLElement;
    columns.getBoundingClientRect = () => boxOf(0, 0, 500, 500);
    cardA.getBoundingClientRect = () => boxOf(10, 10, 100, 40);
    cardB.getBoundingClientRect = () => boxOf(200, 10, 100, 40);
    cardShelved.getBoundingClientRect = () => boxOf(390, 10, 20, 40);

    fireEvent.pointerDown(columns, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent(
      window,
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 400,
        clientY: 100,
        bubbles: true,
      }),
    );

    expect(screen.getByText('2 selected')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Archive \(2\)$/ })).toBeDefined();
  });
});
