// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  IsoDateTime,
  MountId,
  ProjectId,
  SessionId,
  WorkspaceId,
  WorktreeStatus,
} from '@goodboy/types';
import type { MountRowView } from '../../../../../store/slices/project-mounts/mountRowModel';

const { store, remoteKind } = vi.hoisted(() => ({
  remoteKind: { current: 'github' as string | null },
  store: {
    setSessionActiveMount: vi.fn(async () => undefined),
    setScriptsLensScope: vi.fn(),
    openMountDiff: vi.fn(async () => undefined),
    openMountRequest: vi.fn(async () => undefined),
    attachMount: vi.fn(async () => undefined),
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
  ProjectDetachMenu: ({ menuLabel }: { readonly menuLabel?: string }) => (
    <span data-testid="detach-menu">{menuLabel}</span>
  ),
}));
vi.mock('./MountBranchDecision', () => ({
  MountBranchDecision: () => <div data-testid="branch-decision" />,
}));
vi.mock('../../../../worktree/useMountRemoteHostKind', () => ({
  useMountRemoteHostKind: () => remoteKind.current,
}));
vi.mock('../../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('../../../../../shared/lib/editor', () => ({
  openInEditor: vi.fn(async () => undefined),
}));
import { tooltipTextOf } from '../../../../../__tests__/helpers/tooltip';
import { openInEditor } from '../../../../../shared/lib/editor';
import { ProjectMountRow } from './ProjectMountRow';

const sessionId = 'session-1' as SessionId;

const baseRow: MountRowView = {
  mountId: 'mount-1' as MountId,
  projectId: 'api' as ProjectId,
  projectName: 'API',
  projectKind: 'repo',
  mountName: 'API',
  branch: 'feat/api',
  baseBranch: 'main',
  worktreePath: '/api',
  lastWorktreePath: '/api',
  repoRoot: '/repo/api',
  isAttached: true,
  isOnDisk: true,
  revision: 0,
  parallelIndex: 0,
  request: null,
  series: null,
  observation: null,
  isCompleted: false,
};

const renderRow = ({
  diffStat = null,
  worktreeStatus = null,
  isStatusPending = false,
  row = baseRow,
  label = 'API',
}: {
  readonly diffStat?: { additions: number; deletions: number } | null;
  readonly worktreeStatus?: WorktreeStatus | null;
  readonly isStatusPending?: boolean;
  readonly row?: MountRowView;
  readonly label?: string;
}) =>
  render(
    <ul>
      <ProjectMountRow
        sessionId={sessionId}
        row={row}
        label={label}
        workspaceId={'ws-1' as WorkspaceId}
        diffStat={diffStat}
        worktreeStatus={worktreeStatus}
        isStatusPending={isStatusPending}
        onSelectLens={vi.fn()}
      />
    </ul>,
  );

beforeEach(() => {
  vi.clearAllMocks();
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
});

afterEach(cleanup);

describe('ProjectMountRow request action', () => {
  it('opens the pull request for this mount in review, without touching the window bus', async () => {
    const listener = vi.fn();
    window.addEventListener('goodboy:open-github-session', listener);
    renderRow({ diffStat: { additions: 3, deletions: 1 } });

    fireEvent.click(screen.getByRole('button', { name: 'Create a PR for API' }));

    await waitFor(() =>
      expect(store.openMountRequest).toHaveBeenCalledWith({
        sessionId,
        mountId: 'mount-1',
        provider: 'github',
      }),
    );
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('goodboy:open-github-session', listener);
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

  it('shows the request of this mount instead of the create action', async () => {
    renderRow({
      diffStat: { additions: 3, deletions: 1 },
      row: {
        ...baseRow,
        request: {
          provider: 'github',
          identity: null,
          number: 12,
          state: 'open',
          isDraft: false,
          url: 'https://github.com/acme/api/pull/12',
          title: 'Split one',
          label: 'PR #12',
        },
      },
    });

    expect(screen.queryByRole('button', { name: 'Create a PR for API' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open PR #12 of API' }));

    await waitFor(() =>
      expect(store.openMountRequest).toHaveBeenCalledWith({
        sessionId,
        mountId: 'mount-1',
        provider: 'github',
        requestNumber: 12,
      }),
    );
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

describe('ProjectMountRow availability', () => {
  const detached: MountRowView = {
    ...baseRow,
    isAttached: false,
    worktreePath: null,
    isOnDisk: true,
  };

  it('offers mount on an unmounted row and states the kept worktree in the state slot', async () => {
    renderRow({ row: detached });

    expect(screen.getByText('Worktree kept')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Mount API' }));

    await waitFor(() =>
      expect(store.attachMount).toHaveBeenCalledWith({ sessionId, mountId: 'mount-1' }),
    );
  });

  it('hides the worktree tools of an unmounted row', () => {
    renderRow({ row: detached });

    expect(screen.queryByRole('button', { name: 'Open terminal for API' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the folder of API' })).toBeNull();
  });

  it('names the row and its action menu after the mount label', () => {
    renderRow({ row: { ...baseRow }, label: 'API on feat/api' });

    expect(screen.getByRole('listitem', { name: 'API on feat/api' })).toBeDefined();
    expect(screen.getByTestId('detach-menu').textContent).toBe('API on feat/api actions');
  });

  it('renders the branch decision surface when the mount reports a mismatch', () => {
    renderRow({
      row: {
        ...baseRow,
        observation: {
          mountId: 'mount-1' as MountId,
          sessionId,
          state: 'mismatch',
          recordedBranch: 'feat/api',
          observedBranch: 'feat/other',
          revision: 0,
          observedAt: '2026-09-08T10:00:00.000Z' as IsoDateTime,
        },
      },
    });

    expect(screen.getByTestId('branch-decision')).toBeDefined();
  });
});

const openRequest: MountRowView['request'] = {
  provider: 'github',
  identity: null,
  number: 12,
  state: 'open',
  isDraft: false,
  url: 'https://github.com/acme/api/pull/12',
  title: 'Split one',
  label: 'PR #12',
};

const slotsOf = (): ReadonlyArray<Element> =>
  Array.from(screen.getByRole('listitem').firstElementChild?.children ?? []);

describe('ProjectMountRow column grammar', () => {
  const detached: MountRowView = { ...baseRow, isAttached: false, worktreePath: null };

  it('lays every state of a row on the same slots in the same order', () => {
    renderRow({
      diffStat: { additions: 3, deletions: 1 },
      row: { ...baseRow, request: openRequest },
    });
    const attached = slotsOf().map((slot) => slot.className);
    cleanup();
    renderRow({ row: detached });
    const unmounted = slotsOf().map((slot) => slot.className);

    expect(attached).toHaveLength(9);
    expect(unmounted).toEqual(attached);
  });

  it('holds the unmounted status in the slot the request state uses', () => {
    renderRow({
      diffStat: { additions: 3, deletions: 1 },
      row: { ...baseRow, request: openRequest },
    });
    expect(slotsOf()[4]?.textContent).toBe('In review');
    expect(slotsOf()[5]?.textContent).toBe('#12');
    cleanup();

    renderRow({ row: detached });
    expect(slotsOf()[4]?.textContent).toBe('Worktree kept');
    expect(slotsOf()[5]?.textContent).toBe('');
  });

  it('keeps the mount action in the action slot and the menu last', () => {
    renderRow({ row: detached });
    const slots = slotsOf();

    expect(slots[6]?.textContent).toBe('Mount');
    expect(slots.at(-1)?.querySelector('[data-testid="detach-menu"]')).not.toBeNull();
  });

  it('leaves the diff slot empty rather than letting the next column slide left', () => {
    renderRow({ row: detached });
    expect(slotsOf()[3]?.textContent).toBe('');
  });
});

describe('ProjectMountRow folder action', () => {
  it('names the folder action after the mount and reads it out in the tooltip', () => {
    renderRow({});

    const folder = screen.getByRole('button', { name: 'Open the folder of API' });
    expect(tooltipTextOf({ element: folder })).toBe('Open API in an editor, or copy its path');
  });

  it('opens the worktree of the mount, not the first worktree of the session', () => {
    renderRow({});

    fireEvent.click(screen.getByRole('button', { name: 'Open the folder of API' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'VS Code' }));

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

  it('marks the scripts icon when a pending run belongs to the project', () => {
    store.scriptRuns = { [sessionId]: { 'script-api': { status: 'pending' } } };
    renderRow({});
    expect(screen.getByTestId('scripts-activity-dot')).toBeDefined();
    expect(screen.queryByTestId('terminal-activity-dot')).toBeNull();
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

  it('holds a branch placeholder instead of an empty branch cell', () => {
    renderRow({ isStatusPending: true, row: { ...baseRow, branch: '' } });

    expect(screen.getByTestId('project-branch-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('branch-chip')).toBeNull();
  });

  it('leaves a folder mount without any git placeholder', () => {
    renderRow({ isStatusPending: true, row: { ...baseRow, projectKind: 'folder' } });

    expect(screen.queryByTestId('project-distance-skeleton')).toBeNull();
    expect(screen.queryByTestId('project-branch-skeleton')).toBeNull();
  });
});
