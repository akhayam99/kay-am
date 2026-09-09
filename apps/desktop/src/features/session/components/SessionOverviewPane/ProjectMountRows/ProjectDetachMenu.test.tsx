// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId, SessionId, WorktreeDetachAssessment } from '@goodboy/types';

const { state, showToast, worktreeDetachAssessment } = vi.hoisted(() => ({
  state: {
    detachProject: vi.fn(async () => [{ worktreePath: '/worktrees/api', kind: 'removed' }]),
    unmountMount: vi.fn(async () => ({ kept: false })),
    emitNotification: vi.fn(),
    projects: [{ id: 'project-1', kind: 'repo' }],
    sessions: [{ id: 'session-1', state: { kind: 'idle' } }],
    terminalTabs: {},
    sessionProjectMounts: {
      'session-1': [
        {
          mountId: 'mount-1',
          projectId: 'project-1',
          worktreePath: '/worktrees/api',
          branch: 'ak/feat',
        },
      ],
    },
  },
  showToast: vi.fn(),
  worktreeDetachAssessment: vi.fn(),
}));

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('zustand/react/shallow', () => ({ useShallow: <T,>(selector: T) => selector }));

vi.mock('../../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../../../../worktree/worktree', () => ({ worktreeDetachAssessment }));

import { ProjectDetachMenu } from './ProjectDetachMenu';

const typedString = <Value extends string>({ value }: { readonly value: string }): Value =>
  JSON.parse(JSON.stringify(value));

const assessed = ({
  affectedFiles,
  localOnlyCommits,
  hasUpstream,
}: {
  readonly affectedFiles: number;
  readonly localOnlyCommits: number;
  readonly hasUpstream: boolean;
}): WorktreeDetachAssessment => ({
  kind: 'assessed',
  path: '/worktrees/api',
  branch: 'ak/feat',
  hasUpstream,
  affectedFiles,
  localOnlyCommits,
});

const renderMenu = () =>
  render(
    <ProjectDetachMenu
      sessionId={typedString<SessionId>({ value: 'session-1' })}
      projectId={typedString<ProjectId>({ value: 'project-1' })}
      workspaceId={undefined}
      projectName="api"
      worktreePath="/worktrees/api"
      worktreeStatus={null}
      branch="ak/feat"
      triggerClassName="trigger"
    />,
  );

const openConfirm = () => {
  fireEvent.click(screen.getByRole('button', { name: 'api actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Detach project' }));
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.projects = [{ id: 'project-1', kind: 'repo' }];
  state.sessions = [{ id: 'session-1', state: { kind: 'idle' } }];
  state.terminalTabs = {};
  state.sessionProjectMounts = {
    'session-1': [
      {
        mountId: 'mount-1',
        projectId: 'project-1',
        worktreePath: '/worktrees/api',
        branch: 'ak/feat',
      },
    ],
  };
  state.detachProject.mockResolvedValue([{ worktreePath: '/worktrees/api', kind: 'removed' }]);
  worktreeDetachAssessment.mockResolvedValue(
    assessed({ affectedFiles: 0, localOnlyCommits: 0, hasUpstream: true }),
  );
});

describe('ProjectDetachMenu', () => {
  it('shows the checking status without a destructive action while it assesses', () => {
    worktreeDetachAssessment.mockReturnValue(new Promise(() => undefined));
    renderMenu();
    openConfirm();

    expect(screen.getByText('Checking files and commits')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Detach and remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detach and delete files' })).toBeNull();
  });

  it('offers a plain removal for a clean published worktree', async () => {
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and remove' })));
    expect(
      screen.getByText(
        'Remove the clean worktree at /worktrees/api; ak/feat is published, with 0 uncommitted files and 0 unpushed commits, and the branch will remain.',
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Detach and remove' }));
    await waitFor(() =>
      expect(state.detachProject).toHaveBeenCalledWith({
        sessionId: 'session-1',
        projectId: 'project-1',
        disposition: 'remove-clean',
      }),
    );
    expect(showToast).toHaveBeenCalledWith('info', 'Detached api and removed its worktree.');
  });

  it('names the counts and keeps the branch promise on the risky path', async () => {
    worktreeDetachAssessment.mockResolvedValue(
      assessed({ affectedFiles: 1, localOnlyCommits: 2, hasUpstream: true }),
    );
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and delete files' })));
    expect(
      screen.getByText(
        'Remove the worktree at /worktrees/api for ak/feat, which has 2 unpushed commits.',
      ),
    ).toBeDefined();
    expect(screen.getByText('1 uncommitted file will be deleted.')).toBeDefined();
    expect(screen.getByText('The branch and its commits stay in the repository.')).toBeDefined();
  });

  it('assesses every mount of the project and speaks for all of them', async () => {
    state.sessionProjectMounts = {
      'session-1': [
        {
          mountId: 'mount-1',
          projectId: 'project-1',
          worktreePath: '/worktrees/api-one',
          branch: 'ak/one',
        },
        {
          mountId: 'mount-2',
          projectId: 'project-1',
          worktreePath: '/worktrees/api-two',
          branch: 'ak/two',
        },
        {
          mountId: 'mount-3',
          projectId: 'project-other',
          worktreePath: '/worktrees/web',
          branch: 'ak/web',
        },
      ],
    };
    worktreeDetachAssessment.mockImplementation(
      async ({ worktreePath }: { worktreePath: string }) =>
        worktreePath === '/worktrees/api-one'
          ? {
              kind: 'assessed',
              path: worktreePath,
              branch: 'ak/one',
              hasUpstream: true,
              affectedFiles: 2,
              localOnlyCommits: 0,
            }
          : {
              kind: 'assessed',
              path: worktreePath,
              branch: 'ak/two',
              hasUpstream: false,
              affectedFiles: 1,
              localOnlyCommits: 3,
            },
    );
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and delete files' })));
    expect(worktreeDetachAssessment).toHaveBeenCalledTimes(2);
    expect(worktreeDetachAssessment).not.toHaveBeenCalledWith({ worktreePath: '/worktrees/web' });
    expect(
      screen.getByText(
        'Remove 2 worktrees for api, which have 3 local-only commits and 1 branch without an upstream.',
      ),
    ).toBeDefined();
    expect(screen.getByText('3 uncommitted files will be deleted.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Detach details for api' }));
    expect(
      screen.getByText('ak/one at /worktrees/api-one: 2 uncommitted files, 0 unpushed commits'),
    ).toBeDefined();
    expect(
      screen.getByText('ak/two at /worktrees/api-two: 1 uncommitted file, 3 local-only commits'),
    ).toBeDefined();
  });

  it('reports a branch without an upstream as local-only work', async () => {
    worktreeDetachAssessment.mockResolvedValue(
      assessed({ affectedFiles: 0, localOnlyCommits: 0, hasUpstream: false }),
    );
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and delete files' })));
    expect(
      screen.getByText('Remove the worktree at /worktrees/api for ak/feat, which has no upstream.'),
    ).toBeDefined();
    expect(screen.getByText('No uncommitted files will be deleted.')).toBeDefined();
  });

  it('hides the keep alternative behind the details disclosure', async () => {
    worktreeDetachAssessment.mockResolvedValue(
      assessed({ affectedFiles: 3, localOnlyCommits: 0, hasUpstream: true }),
    );
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and delete files' })));
    expect(screen.queryByRole('button', { name: 'Detach and keep files' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Detach details for api' }));

    expect(screen.getByText('Files affected (3)')).toBeDefined();
    expect(screen.getByText('Unpushed commits (0)')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Detach and keep files' }));
    await waitFor(() =>
      expect(state.detachProject).toHaveBeenCalledWith({
        sessionId: 'session-1',
        projectId: 'project-1',
        disposition: 'keep-files',
      }),
    );
  });

  it('keeps the directory of a folder project without assessing it', () => {
    state.projects = [{ id: 'project-1', kind: 'folder' }];
    renderMenu();
    openConfirm();

    expect(worktreeDetachAssessment).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Detach api from this session; its folder at /worktrees/api will stay on disk.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Detach and keep files' })).toBeDefined();
  });

  it('never offers removal when the safety of the worktree is unknown', async () => {
    worktreeDetachAssessment.mockRejectedValue(new Error('git is unavailable'));
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and keep files' })));
    expect(
      screen.getByText(
        'The safety of ak/feat at /worktrees/api could not be verified; detach will keep the directory.',
      ),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeDefined();
  });

  it('reports an already absent directory', async () => {
    worktreeDetachAssessment.mockResolvedValue({ kind: 'missing', path: '/worktrees/api' });
    state.detachProject.mockResolvedValue([{ worktreePath: '/worktrees/api', kind: 'missing' }]);
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and remove' })));
    expect(
      screen.getByText(
        "The directory at /worktrees/api is already absent; detach will remove only the session's mount record.",
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Detach and remove' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'info',
        'Detached api. Its directory was already absent.',
      ),
    );
  });

  it('blocks removal while work is still running in the project', () => {
    state.sessions = [{ id: 'session-1', state: { kind: 'running' } }];
    renderMenu();
    openConfirm();

    expect(worktreeDetachAssessment).not.toHaveBeenCalled();
    expect(
      screen.getByText('Work is still running in api; stop it before removing this worktree.'),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Detach and keep files' })).toBeDefined();
  });

  it('names an open terminal as the blocker it actually is', () => {
    state.terminalTabs = {
      'session-1': [{ id: 'tab-1', sessionId: 'session-1', cwd: '/worktrees/api' }],
    };
    renderMenu();
    openConfirm();

    expect(worktreeDetachAssessment).not.toHaveBeenCalled();
    expect(
      screen.getByText('A terminal is open in api; close it before removing this worktree.'),
    ).toBeDefined();
    expect(screen.queryByText(/Work is still running/)).toBeNull();
  });

  it('keeps the confirmation open and reports a removal failure', async () => {
    state.detachProject.mockResolvedValue([{ worktreePath: '/worktrees/api', kind: 'failed' }]);
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and remove' })));
    fireEvent.click(screen.getByRole('button', { name: 'Detach and remove' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'error',
        'Could not finish removing the worktree. The mount is retained; check again before retrying.',
      ),
    );
    expect(screen.getByText('Detach api?')).toBeDefined();
  });

  it('returns to the item list on cancel', async () => {
    renderMenu();
    openConfirm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Detach and remove' })));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('menuitem', { name: 'Detach project' })).toBeDefined();
    expect(state.detachProject).not.toHaveBeenCalled();
  });
});
