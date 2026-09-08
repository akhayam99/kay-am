// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OverflowMenuItem } from '@goodboy/ui';
import type {
  Project,
  PullRequestState,
  SessionId,
  SessionProjectMount,
  WorktreeStatus,
} from '@goodboy/types';

const { store, remoteKind, openReviewMock } = vi.hoisted(() => ({
  remoteKind: { current: 'github' as string | null },
  openReviewMock: vi.fn(),
  store: {
    setSessionActiveProject: vi.fn(async () => undefined),
    setScriptsLensScope: vi.fn(),
    openMountDiff: vi.fn(async () => undefined),
    projects: [] as ReadonlyArray<{ id: string; baseBranch?: string | null }>,
    emitNotification: vi.fn(),
    sessionWorktrees: {} as Record<string, ReadonlyArray<string>>,
    detectedEditors: [] as ReadonlyArray<{ binary: string; label: string }>,
    loadDetectedEditors: vi.fn(async () => undefined),
    terminalTabs: {} as Record<
      string,
      ReadonlyArray<{ id: string; projectId?: string; status: string }>
    >,
    scriptRuns: {} as Record<string, Record<string, { status: string }>>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<{ name: string; status: string }>>,
    projectScripts: {} as Record<string, ReadonlyArray<{ id: string; projectId: string }>>,
  },
}));

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
}));
vi.mock('./ProjectBranchChip', () => ({
  ProjectBranchChip: () => <span data-testid="branch-chip" />,
}));
vi.mock('./ProjectSyncControl', () => ({
  ProjectSyncControl: () => <span data-testid="sync-control" />,
}));
vi.mock('./ProjectDetachMenu', () => ({
  ProjectDetachMenu: () => <span data-testid="detach-menu" />,
}));
vi.mock('../../../../worktree/useRemoteHostKind', () => ({
  useRemoteHostKind: () => remoteKind.current,
}));
vi.mock('../../../../review/openReview', () => ({
  openReview: openReviewMock,
}));
vi.mock('../../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../../../shared/lib/editor', () => ({
  openInEditor: vi.fn(async () => undefined),
}));
vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  const { Tooltip } = actual;
  return {
    ...actual,
    OverflowMenu: ({
      items,
      label,
      tooltip,
      triggerClassName,
      trigger,
    }: {
      readonly items: ReadonlyArray<OverflowMenuItem>;
      readonly label: string;
      readonly tooltip: string;
      readonly triggerClassName: string;
      readonly trigger: ReactNode;
    }) => (
      <span>
        <Tooltip content={tooltip}>
          <button type="button" aria-label={label} className={triggerClassName}>
            {trigger}
          </button>
        </Tooltip>
        {items.map((item) =>
          item.kind === 'item' ? (
            <button key={item.key} type="button" onClick={item.onClick}>
              {item.label}
            </button>
          ) : null,
        )}
      </span>
    ),
  };
});

import { tooltipTextOf } from '../../../../../__tests__/helpers/tooltip';
import { openInEditor } from '../../../../../shared/lib/editor';
import { ProjectMountRow } from './ProjectMountRow';

const sessionId = 'session-1' as SessionId;

const project = {
  id: 'api',
  name: 'API',
  kind: 'repo',
  workspaceId: 'ws-1',
} as Project;

const mount = {
  projectId: 'api',
  mountName: 'API',
  branch: 'feat/api',
  worktreePath: '/api',
  repoRoot: '/repo/api',
} as SessionProjectMount;

const renderRow = ({
  diffStat = null,
  pullRequest = null,
  worktreeStatus = null,
  isStatusPending = false,
  rowMount = mount,
  rowProject = project,
}: {
  readonly diffStat?: { additions: number; deletions: number } | null;
  readonly pullRequest?: PullRequestState | null;
  readonly worktreeStatus?: WorktreeStatus | null;
  readonly isStatusPending?: boolean;
  readonly rowMount?: SessionProjectMount;
  readonly rowProject?: Project | null;
}) =>
  render(
    <ProjectMountRow
      sessionId={sessionId}
      project={rowProject}
      mount={rowMount}
      diffStat={diffStat}
      pullRequest={pullRequest ?? null}
      worktreeStatus={worktreeStatus}
      isStatusPending={isStatusPending}
      onSelectLens={vi.fn()}
    />,
  );

beforeEach(() => {
  openReviewMock.mockClear();
  store.setSessionActiveProject.mockClear();
  store.setSessionActiveProject.mockResolvedValue(undefined);
  remoteKind.current = 'github';
  store.terminalTabs = {};
  store.scriptRuns = {};
  store.projectScripts = {
    'ws-1': [
      { id: 'script-api', projectId: 'api' },
      { id: 'script-web', projectId: 'web' },
    ],
  };
  store.sessionWorktrees = { [sessionId]: ['/session-root'] };
  store.sessionPhaseRuns = {};
  store.detectedEditors = [{ binary: 'code', label: 'VS Code' }];
  vi.mocked(openInEditor).mockClear();
});

afterEach(cleanup);

describe('ProjectMountRow create pr action', () => {
  it('offers create pr when there are changes and no pr, targeting the mount project', async () => {
    renderRow({ diffStat: { additions: 3, deletions: 1 } });

    const action = screen.getByRole('button', { name: 'Create a PR for API' });
    fireEvent.click(action);

    await waitFor(() => expect(openReviewMock).toHaveBeenCalledTimes(1));
    expect(openReviewMock).toHaveBeenCalledWith({ sessionId, mode: 'create_pr' });
    expect(store.setSessionActiveProject).toHaveBeenCalledWith({ sessionId, projectId: 'api' });
  });

  it('blocks create pr while an agent is opening one', () => {
    store.sessionPhaseRuns = {
      [sessionId]: [{ name: 'open pull request', status: 'running' }],
    };
    renderRow({ diffStat: { additions: 3, deletions: 1 } });

    const action = screen.getByRole('button', { name: 'An agent is opening a PR for API' });
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(action.textContent).toBe('Opening PR…');
  });

  it('hides create pr without changes', () => {
    renderRow({ diffStat: null });
    expect(screen.queryByRole('button', { name: 'Create a PR for API' })).toBeNull();
  });

  it('hides create pr when a pr already exists', () => {
    renderRow({
      diffStat: { additions: 3, deletions: 1 },
      pullRequest: { number: 12, state: 'open', isDraft: false } as PullRequestState,
    });
    expect(screen.queryByRole('button', { name: 'Create a PR for API' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open PR #12' })).toBeDefined();
  });

  it('opens the existing pull request in Review, on its number', () => {
    renderRow({
      diffStat: { additions: 3, deletions: 1 },
      pullRequest: { number: 12, state: 'open', isDraft: false } as PullRequestState,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open PR #12' }));

    expect(openReviewMock).toHaveBeenCalledWith({ sessionId, prNumber: 12 });
  });

  it('offers create mr on a gitlab remote', () => {
    remoteKind.current = 'gitlab';
    renderRow({ diffStat: { additions: 1, deletions: 0 } });
    expect(screen.getByRole('button', { name: 'Create a PR for API' }).textContent).toBe(
      'Create MR',
    );
  });

  it('hides the action when the remote kind is unknown', () => {
    remoteKind.current = null;
    renderRow({ diffStat: { additions: 1, deletions: 0 } });
    expect(screen.queryByRole('button', { name: 'Create a PR for API' })).toBeNull();
  });
});

describe('ProjectMountRow folder action', () => {
  it('names the folder action after the project and reads it out in the tooltip', () => {
    renderRow({});

    const folder = screen.getByRole('button', { name: 'Open the folder of API' });
    expect(tooltipTextOf({ element: folder })).toBe('Open API in an editor, or copy its path');
  });

  it('opens the worktree of the mount, not the first worktree of the session', () => {
    renderRow({});

    fireEvent.click(screen.getByRole('button', { name: 'Open the folder of API' }));
    fireEvent.click(screen.getByRole('button', { name: 'VS Code' }));

    expect(openInEditor).toHaveBeenCalledWith('/api', 'code');
  });

  it('leads the trio folder, terminal, scripts', () => {
    renderRow({});

    const folder = screen.getByRole('button', { name: 'Open the folder of API' });
    const terminal = screen.getByRole('button', { name: 'Open terminal for API' });
    const scripts = screen.getByRole('button', { name: 'Open scripts for API' });
    expect(
      folder.compareDocumentPosition(terminal) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      terminal.compareDocumentPosition(scripts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('ProjectMountRow activity dots', () => {
  it('marks the terminal icon when a live tab belongs to the project', () => {
    store.terminalTabs = {
      [sessionId]: [{ id: `${sessionId}::t1`, projectId: 'api', status: 'running' }],
    };
    renderRow({});
    expect(screen.getByTestId('terminal-activity-dot')).toBeDefined();
    expect(screen.queryByTestId('scripts-activity-dot')).toBeNull();
  });

  it('leaves the terminal icon bare when the live tab belongs to another project', () => {
    store.terminalTabs = {
      [sessionId]: [{ id: `${sessionId}::t1`, projectId: 'web', status: 'running' }],
    };
    renderRow({});
    expect(screen.queryByTestId('terminal-activity-dot')).toBeNull();
  });

  it('leaves the terminal icon bare when the only tab of the project has exited', () => {
    store.terminalTabs = {
      [sessionId]: [{ id: `${sessionId}::t1`, projectId: 'api', status: 'exited' }],
    };
    renderRow({});
    expect(screen.queryByTestId('terminal-activity-dot')).toBeNull();
  });

  it('marks the scripts icon when a pending run belongs to the project', () => {
    store.scriptRuns = { [sessionId]: { 'script-api': { status: 'pending' } } };
    renderRow({});
    expect(screen.getByTestId('scripts-activity-dot')).toBeDefined();
    expect(screen.queryByTestId('terminal-activity-dot')).toBeNull();
  });

  it('leaves the scripts icon bare when the pending run belongs to another project', () => {
    store.scriptRuns = { [sessionId]: { 'script-web': { status: 'pending' } } };
    renderRow({});
    expect(screen.queryByTestId('scripts-activity-dot')).toBeNull();
  });

  it('leaves the scripts icon bare when the run of the project has finished', () => {
    store.scriptRuns = { [sessionId]: { 'script-api': { status: 'ok' } } };
    renderRow({});
    expect(screen.queryByTestId('scripts-activity-dot')).toBeNull();
  });

  it('carries the counts in the tooltips', () => {
    store.terminalTabs = {
      [sessionId]: [
        { id: `${sessionId}::t1`, projectId: 'api', status: 'running' },
        { id: `${sessionId}::t2`, projectId: 'api', status: 'running' },
        { id: `${sessionId}::t3`, projectId: 'web', status: 'running' },
      ],
    };
    store.scriptRuns = { [sessionId]: { 'script-api': { status: 'pending' } } };
    renderRow({});

    expect(
      tooltipTextOf({ element: screen.getByRole('button', { name: 'Open terminal for API' }) }),
    ).toBe('Open terminal in API, 2 running');
    expect(
      tooltipTextOf({ element: screen.getByRole('button', { name: 'Open scripts for API' }) }),
    ).toBe('Open scripts for API, 1 running');
  });

  it('keeps the plain tooltips when nothing runs for the project', () => {
    renderRow({});

    expect(
      tooltipTextOf({ element: screen.getByRole('button', { name: 'Open terminal for API' }) }),
    ).toBe('Open terminal in API');
    expect(
      tooltipTextOf({ element: screen.getByRole('button', { name: 'Open scripts for API' }) }),
    ).toBe('Open scripts for API');
  });
});

describe('ProjectMountRow loading placeholders', () => {
  const status = {
    branch: 'feat/api',
    mainDistance: { kind: 'known', ahead: 0, behind: 0 },
    upstreamDistance: { kind: 'known', ahead: 0, behind: 0 },
  } as unknown as WorktreeStatus;

  it('holds a distance placeholder while the git status is still pending', () => {
    renderRow({ isStatusPending: true });

    expect(screen.getByTestId('project-distance-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('sync-control')).toBeNull();
  });

  it('swaps the placeholder for the sync control once the status lands', () => {
    renderRow({ worktreeStatus: status });

    expect(screen.queryByTestId('project-distance-skeleton')).toBeNull();
    expect(screen.getByTestId('sync-control')).not.toBeNull();
  });

  it('drops the placeholder when the status fetch settled without a value', () => {
    renderRow({ worktreeStatus: null, isStatusPending: false });

    expect(screen.queryByTestId('project-distance-skeleton')).toBeNull();
    expect(screen.queryByTestId('project-branch-skeleton')).toBeNull();
    expect(screen.getByTestId('sync-control')).not.toBeNull();
  });

  it('holds a branch placeholder instead of an empty branch cell', () => {
    renderRow({ isStatusPending: true, rowMount: { ...mount, branch: '' } as SessionProjectMount });

    expect(screen.getByTestId('project-branch-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('branch-chip')).toBeNull();
  });

  it('leaves a folder mount without any git placeholder', () => {
    renderRow({ isStatusPending: true, rowProject: { ...project, kind: 'folder' } as Project });

    expect(screen.queryByTestId('project-distance-skeleton')).toBeNull();
    expect(screen.queryByTestId('project-branch-skeleton')).toBeNull();
  });
});
