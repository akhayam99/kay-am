// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Project, ProjectId, WorkspaceGitStatus, WorkspaceGitState } from '@goodboy/types';

const h = vi.hoisted(() => ({
  invoke: vi.fn(async () => undefined),
  fastForward: vi.fn(async () => undefined),
  store: {
    projectCheckoutPulling: {} as Record<string, boolean>,
    fastForwardProjectCheckout: vi.fn(async () => undefined),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof h.store) => T) => selector(h.store),
}));

import { ProjectGitPill } from './ProjectGitPill';
import { ProjectGitPills } from './index';

const project = {
  id: 'project-1' as ProjectId,
  name: 'Web',
  rootPath: '/repo/web',
  kind: 'repo',
} as Project;

const statusOf = ({
  state = 'ready',
  behind = 0,
  changed = 0,
  unmerged = 0,
}: {
  readonly state?: WorkspaceGitState;
  readonly behind?: number;
  readonly changed?: number;
  readonly unmerged?: number;
}): WorkspaceGitStatus => ({
  state,
  branch: state === 'ready' ? 'main' : null,
  headSubject: state === 'ready' ? 'base' : null,
  upstreamDistance: { kind: 'known', ahead: 0, behind },
  workingTree: { kind: 'known', staged: 0, unstaged: changed, untracked: 0, unmerged, changed },
  upstream: state === 'ready' ? 'origin/main' : null,
  inProgress: null,
});

const renderPill = ({ status }: { readonly status: WorkspaceGitStatus }) =>
  render(<ProjectGitPill project={project} status={status} shouldShowProjectName={false} />);

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue(undefined);
  h.store.fastForwardProjectCheckout = h.fastForward;
  h.fastForward.mockReset();
  h.fastForward.mockResolvedValue(undefined);
  h.store.projectCheckoutPulling = {};
});

afterEach(cleanup);

describe('ProjectGitPill', () => {
  it('names what the count counts instead of showing a bare number', () => {
    renderPill({ status: statusOf({ behind: 2, changed: 3, unmerged: 1 }) });
    expect(screen.getByTestId('project-git-count').textContent).toBe('4 uncommitted');
  });

  it('shows no badge when the checkout is clean', () => {
    renderPill({ status: statusOf({}) });
    expect(screen.queryByTestId('project-git-count')).toBeNull();
    expect(screen.queryByTestId('project-git-warning')).toBeNull();
  });

  it('shows a warning and opens the init guide for an absent repository', () => {
    renderPill({ status: statusOf({ state: 'absent' }) });
    expect(screen.getByTestId('project-git-warning')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Web git status/ }));
    expect(screen.getByText('This folder has no git repository yet')).toBeDefined();
    expect(screen.getByLabelText('copy command: Create the repository')).toBeDefined();
  });

  it('fast-forwards the correct project and shows the disabled reason inline', () => {
    renderPill({ status: statusOf({ behind: 2 }) });
    fireEvent.click(screen.getByRole('button', { name: /Web git status/ }));
    fireEvent.click(screen.getByRole('button', { name: /Fast-forward main to origin\/main/ }));
    expect(h.fastForward).toHaveBeenCalledWith({ projectId: project.id });

    cleanup();
    renderPill({ status: statusOf({}) });
    fireEvent.click(screen.getByRole('button', { name: /Web git status/ }));
    expect(screen.getByText('Already up to date.')).toBeDefined();
    expect(
      screen
        .getByRole('button', { name: /Fast-forward main to origin\/main/ })
        .hasAttribute('title'),
    ).toBe(false);
  });

  it('renders an editor launch error as an alert', async () => {
    h.invoke.mockRejectedValueOnce(new Error('editor unavailable'));
    renderPill({ status: statusOf({}) });
    fireEvent.click(screen.getByRole('button', { name: /Web git status/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('editor unavailable'),
    );
  });

  it('labels an unreachable checkout instead of calling it setup', () => {
    renderPill({ status: statusOf({ state: 'missing' }) });
    expect(screen.getByText('Unreachable')).toBeDefined();
    expect(screen.queryByText('Git setup')).toBeNull();
  });
});

describe('ProjectGitPills', () => {
  const entryOf = ({
    id,
    name,
    status,
  }: {
    readonly id: string;
    readonly name: string;
    readonly status: WorkspaceGitStatus;
  }) => ({
    project: { ...project, id: id as ProjectId, name },
    status,
  });

  it('renders one aggregate trigger naming the summed uncommitted files', () => {
    render(
      <ProjectGitPills
        entries={[
          entryOf({ id: 'one', name: 'One', status: statusOf({ behind: 2 }) }),
          entryOf({ id: 'two', name: 'Two', status: statusOf({ changed: 3 }) }),
          entryOf({ id: 'three', name: 'Three', status: statusOf({ unmerged: 1 }) }),
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: '3 repository git statuses' })).toBeDefined();
    expect(screen.getByTestId('project-git-summary-count').textContent).toBe('4 uncommitted');
  });

  it('shows the aggregate warning instead of the count', () => {
    render(
      <ProjectGitPills
        entries={[
          entryOf({ id: 'one', name: 'One', status: statusOf({ behind: 2 }) }),
          entryOf({ id: 'two', name: 'Two', status: statusOf({ state: 'absent' }) }),
          entryOf({ id: 'three', name: 'Three', status: statusOf({ changed: 1 }) }),
        ]}
      />,
    );
    expect(screen.getByTestId('project-git-summary-warning')).toBeDefined();
    expect(screen.queryByTestId('project-git-summary-count')).toBeNull();
  });

  it('drills into project detail and returns to the sorted list', () => {
    render(
      <ProjectGitPills
        entries={[
          entryOf({ id: 'alpha', name: 'Alpha', status: statusOf({ behind: 1 }) }),
          entryOf({ id: 'warning', name: 'Warning', status: statusOf({ state: 'absent' }) }),
          entryOf({ id: 'beta', name: 'Beta', status: statusOf({ changed: 3 }) }),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '3 repository git statuses' }));
    const rows = screen
      .getAllByRole('button')
      .filter((button) =>
        ['Warning', 'Beta', 'Alpha'].some((name) => button.textContent?.includes(name) === true),
      );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Warning'),
      expect.stringContaining('Beta'),
      expect.stringContaining('Alpha'),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    expect(screen.getByText('3 uncommitted')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByRole('button', { name: /Warning/ })).toBeDefined();
  });
});
