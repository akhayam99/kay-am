// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session, SessionId, WorkspaceId } from '@goodboy/types';

const { state, viewPrefs } = vi.hoisted(() => ({
  state: {
    sessionGithub: {} as Record<string, unknown>,
    sessionTelemetry: {} as Record<string, ReadonlyArray<unknown>>,
    sessionExternalTasks: {} as Record<string, unknown>,
    sessionProjectMounts: {} as Record<string, ReadonlyArray<unknown>>,
    projects: [] as ReadonlyArray<unknown>,
    bulkUnarchiveTask: vi.fn(async () => undefined),
    bulkArchiveTask: vi.fn(async () => undefined),
    bulkDeleteTask: vi.fn(async () => undefined),
  },
  viewPrefs: {
    current: { group: 'none' as 'none' | 'stage', sort: 'recent' as const },
  },
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: [] as readonly never[],
  useAppStore: <T,>(selector: (s: typeof state) => T) => selector(state),
  useSessionCost: () => 0,
  useSessionHasUnread: () => false,
  useSessionStageInfo: () => ({ stage: 'done' as const, reason: 'idle' }),
  useSessionViewPrefs: () => viewPrefs.current,
  useSortedGroupedSessions: (_workspaceId: unknown, sessions: ReadonlyArray<unknown>) =>
    viewPrefs.current.group === 'stage' ? [{ key: 'done', sessions }] : [{ key: 'all', sessions }],
}));

vi.mock('./SessionViewMenu', () => ({
  SessionViewMenu: () => null,
}));

vi.mock('../ProjectFilter', () => ({
  ProjectFilter: () => <span data-testid="project-filter" />,
}));

vi.mock('../../../../features/providers/components/CostBadge', () => ({
  CostBadge: () => null,
}));

vi.mock('../../../../features/github/components/PullRequestChip', () => ({
  pullRequestMeta: () => null,
}));

import { SessionActivityBar } from './index';

const WS_ID = 'ws-1' as WorkspaceId;

function makeSession(id: string, goal: string): Session {
  return {
    id: id as SessionId,
    workspaceId: WS_ID,
    goal,
    state: { kind: 'idle', lastActivityAt: '2026-05-28T00:00:00.000Z' },
    workflowRuns: [],
  } as unknown as Session;
}

function renderBar(
  archived: ReadonlyArray<Session>,
  active: ReadonlyArray<Session> = [],
  onSelectSession: (id: SessionId) => void = vi.fn(),
  onArchivedTabOpen: () => void = vi.fn(),
) {
  return render(
    <SessionActivityBar
      workspaceId={WS_ID}
      sessions={active}
      archivedSessions={archived}
      currentSessionId={null}
      onSelectSession={onSelectSession}
      onArchivedTabOpen={onArchivedTabOpen}
    />,
  );
}

function toggleArchivedTab() {
  fireEvent.click(screen.getByRole('button', { name: /^(Show|Hide) archived \(\d+\)$/ }));
}

function rowAt(index: number): HTMLElement {
  const row = document.querySelectorAll<HTMLElement>('[data-select-id]')[index];
  if (!row) {
    throw new Error(`no session row at index ${index}`);
  }
  return row;
}

function selectRow(
  index: number,
  over: { readonly shiftKey?: boolean; readonly altKey?: boolean } = {},
): HTMLElement {
  const row = rowAt(index);
  fireEvent.click(row, { altKey: true, ...over });
  return row;
}

beforeEach(() => {
  state.bulkUnarchiveTask.mockClear();
  state.bulkArchiveTask.mockClear();
  state.bulkDeleteTask.mockClear();
  state.sessionExternalTasks = {};
  state.sessionProjectMounts = {};
  state.projects = [];
  viewPrefs.current = { group: 'none', sort: 'recent' };
});

afterEach(cleanup);

describe('SessionActivityBar, baseline', () => {
  it('renders the Sessions header and the New session button', () => {
    renderBar([]);
    expect(screen.getByText(/^Sessions$/)).toBeDefined();
    expect(screen.getByRole('button', { name: /create new session/i })).toBeDefined();
    expect(screen.getByTestId('project-filter')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Archived/ })).toBeNull();
    expect(screen.getByRole('button', { name: /create new session/i }).getAttribute('title')).toBe(
      null,
    );
  });

  it('renders empty-state copy when no sessions in active tab', () => {
    renderBar([]);
    expect(screen.getByText(/no sessions yet/i)).toBeDefined();
  });

  it('offers no collapse control in the header', () => {
    renderBar([]);
    expect(screen.queryByRole('button', { name: 'hide sessions' })).toBeNull();
  });

  it('dispatches the new-session event when the New button is clicked', () => {
    const listener = vi.fn();
    window.addEventListener('goodboy:new-session', listener);
    renderBar([]);
    fireEvent.click(screen.getByRole('button', { name: /create new session/i }));
    expect(listener).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).toBeNull();
    window.removeEventListener('goodboy:new-session', listener);
  });

  it('switches back from the archived tab when a new session is requested', () => {
    renderBar([makeSession('s-1', 'archived one')]);
    toggleArchivedTab();
    expect(screen.queryByRole('button', { name: /create new session/i })).toBeNull();
    fireEvent(window, new CustomEvent('goodboy:new-session'));
    expect(screen.getByRole('button', { name: /create new session/i })).toBeDefined();
  });

  it('does not repeat mounted project names in the compact session row', () => {
    state.projects = [{ id: 'project-1', name: 'Goodboy' }];
    state.sessionProjectMounts = {
      'a-1': [
        { projectId: 'project-1', mountName: 'desktop' },
        { projectId: 'project-1', mountName: 'desktop-copy' },
      ],
    };
    renderBar([], [makeSession('a-1', 'duplicate mounts')]);
    expect(screen.queryByLabelText('Project: Goodboy')).toBeNull();
    expect(screen.queryByLabelText(/2 projects/)).toBeNull();
  });

  it('shows the archived count and loads archived sessions on the transition', () => {
    const onArchivedTabOpen = vi.fn();
    renderBar([makeSession('s-1', 'archived one')], [], vi.fn(), onArchivedTabOpen);

    const toggle = screen.getByRole('button', { name: 'Show archived (1)' });
    fireEvent.click(toggle);

    expect(onArchivedTabOpen).toHaveBeenCalledOnce();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps terminal stage groups collapsed until their labeled count is expanded', () => {
    viewPrefs.current = { group: 'stage', sort: 'recent' };
    renderBar([], [makeSession('a-1', 'finished work')]);

    const group = screen.getByRole('button', { name: 'done' });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(group.textContent).toContain('1');
    expect(screen.queryByRole('button', { name: /finished work/i })).toBeNull();

    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /finished work/i })).toBeDefined();
  });
});

describe('SessionActivityBar, bulk selection', () => {
  it('carries selection on the row itself, with no checkbox in either tab', () => {
    renderBar([makeSession('s-1', 'archived one')], [makeSession('a-1', 'active one')]);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(rowAt(0).getAttribute('aria-keyshortcuts')).toBe('Alt+Enter Alt+Space');
    toggleArchivedTab();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(rowAt(0).getAttribute('data-select-id')).toBe('s-1');
  });

  it('selects from the keyboard with alt and Enter', () => {
    const onSelect = vi.fn();
    renderBar([], [makeSession('a-1', 'keyboard me')], onSelect);
    fireEvent.keyDown(rowAt(0), { key: 'Enter', altKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/1 selected/)).toBeDefined();
  });

  it('selects from the keyboard with alt and Space, matching aria-keyshortcuts', () => {
    const onSelect = vi.fn();
    renderBar([], [makeSession('a-1', 'keyboard me too')], onSelect);
    fireEvent.keyDown(rowAt(0), { key: ' ', altKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/1 selected/)).toBeDefined();
  });

  it('offers Archive instead of Restore for active sessions', () => {
    renderBar([], [makeSession('a-1', 'active one')]);
    selectRow(0);
    expect(screen.getByRole('button', { name: /^Archive \(1\)$/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
  });

  it('arms an inline confirmation on Archive and calls bulkArchiveTask once confirmed', async () => {
    renderBar([], [makeSession('a-1', 'active one')]);
    selectRow(0);
    fireEvent.click(screen.getByRole('button', { name: /^Archive \(1\)$/ }));
    const panel = screen.getByRole('group', { name: 'Archive 1 sessions?' });
    expect(state.bulkArchiveTask).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: /^Archive \(1\)$/ }));
    await waitFor(() => expect(state.bulkArchiveTask).toHaveBeenCalledWith(['a-1']));
  });

  it('selects from the row body when a modifier key is held instead of opening the session', () => {
    const onSelect = vi.fn();
    renderBar([], [makeSession('a-1', 'modifier me')], onSelect);
    fireEvent.click(screen.getByRole('button', { name: /modifier me/ }), { metaKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/1 selected/)).toBeDefined();
  });

  it('extends the selection to a range on shift-click', () => {
    renderBar([], [makeSession('a-1', 'one'), makeSession('a-2', 'two'), makeSession('a-3', 'x')]);
    selectRow(0);
    selectRow(2, { shiftKey: true, altKey: false });
    expect(screen.getByText(/3 selected/)).toBeDefined();
  });

  it('builds a selection from alt clicks and surfaces the bulk action bar with a count', () => {
    renderBar([makeSession('s-1', 'one'), makeSession('s-2', 'two')]);
    toggleArchivedTab();
    selectRow(0);
    expect(screen.getByText(/1 selected/)).toBeDefined();
    expect(screen.getByRole('button', { name: /^Restore \(1\)$/ })).toBeDefined();
  });

  it('calls bulkUnarchiveTask with the selected ids and clears the selection on Restore', async () => {
    renderBar([makeSession('s-1', 'one'), makeSession('s-2', 'two')]);
    toggleArchivedTab();
    selectRow(0);
    selectRow(1);
    fireEvent.click(screen.getByRole('button', { name: /^Restore \(2\)$/ }));
    expect(state.bulkUnarchiveTask).toHaveBeenCalledWith(['s-1', 's-2']);
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });

  it('arms an inline confirmation on Delete and calls bulkDeleteTask once confirmed', async () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    selectRow(0);
    fireEvent.click(screen.getByRole('button', { name: /^Delete \(1\)$/ }));
    const panel = screen.getByRole('group', { name: 'Delete 1 session?' });
    expect(state.bulkDeleteTask).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: /^Delete \(1\)$/ }));
    await waitFor(() => expect(state.bulkDeleteTask).toHaveBeenCalledWith(['s-1']));
  });

  it('clears the selection when switching tabs', () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    selectRow(0);
    expect(screen.getByText(/1 selected/)).toBeDefined();
    toggleArchivedTab();
    toggleArchivedTab();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('shows no bulk action bar when nothing is selected in the archived tab', () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('toggles aria-checked and hides the bulk bar when the last selection is removed', () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    expect(rowAt(0).getAttribute('aria-pressed')).toBe('false');
    selectRow(0);
    expect(rowAt(0).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/1 selected/)).toBeDefined();
    selectRow(0);
    expect(rowAt(0).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('reflects the selected count across both bulk actions when several are picked', () => {
    renderBar([makeSession('s-1', 'one'), makeSession('s-2', 'two'), makeSession('s-3', 'three')]);
    toggleArchivedTab();
    selectRow(0);
    selectRow(2);
    expect(screen.getByText(/2 selected/)).toBeDefined();
    expect(screen.getByRole('button', { name: /^Restore \(2\)$/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /^Delete \(2\)$/ })).toBeDefined();
  });

  it('clears the selection via the Clear button', () => {
    renderBar([makeSession('s-1', 'one'), makeSession('s-2', 'two')]);
    toggleArchivedTab();
    selectRow(0);
    expect(screen.getByText(/1 selected/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    expect(screen.queryByText(/selected/)).toBeNull();
    expect(state.bulkUnarchiveTask).not.toHaveBeenCalled();
    expect(state.bulkDeleteTask).not.toHaveBeenCalled();
  });

  it('lists the selected session goals in the confirmation', () => {
    renderBar([makeSession('s-1', 'alpha goal'), makeSession('s-2', 'beta goal')]);
    toggleArchivedTab();
    selectRow(0);
    selectRow(1);
    fireEvent.click(screen.getByRole('button', { name: /^Delete \(2\)$/ }));
    const panel = screen.getByRole('group', { name: 'Delete 2 sessions?' });
    expect(within(panel).getByText('alpha goal')).toBeDefined();
    expect(within(panel).getByText('beta goal')).toBeDefined();
  });

  it('does not call bulkDeleteTask when the confirmation is cancelled', () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    selectRow(0);
    fireEvent.click(screen.getByRole('button', { name: /^Delete \(1\)$/ }));
    const panel = screen.getByRole('group', { name: 'Delete 1 session?' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Cancel$/ }));
    expect(state.bulkDeleteTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Delete 1 session?' })).toBeNull();
    expect(screen.getByText(/1 selected/)).toBeDefined();
  });

  it('opens a session on body click without toggling its selection in the archived tab', () => {
    const onSelect = vi.fn();
    renderBar([makeSession('s-1', 'open me')], [], onSelect);
    toggleArchivedTab();
    fireEvent.click(screen.getByRole('button', { name: /open me/ }));
    expect(onSelect).toHaveBeenCalledWith('s-1');
    expect(rowAt(0).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('clears the selection after a confirmed bulk delete', async () => {
    renderBar([makeSession('s-1', 'one')]);
    toggleArchivedTab();
    selectRow(0);
    fireEvent.click(screen.getByRole('button', { name: /^Delete \(1\)$/ }));
    const panel = screen.getByRole('group', { name: 'Delete 1 session?' });
    fireEvent.click(within(panel).getByRole('button', { name: /^Delete \(1\)$/ }));
    await waitFor(() => expect(state.bulkDeleteTask).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/selected/)).toBeNull());
  });
});

describe('SessionActivityBar, external task chip', () => {
  it('renders no external task chip when the session has no mapped task', () => {
    renderBar([], [makeSession('a-1', 'plain session')]);
    expect(screen.queryByRole('button', { name: /studio/i })).toBeNull();
  });

  it('appends the identifier to the item title without rendering a task glyph', () => {
    state.sessionExternalTasks = {
      'a-1': [
        {
          sessionId: 'a-1',
          provider: 'linear',
          externalId: 'ext-1',
          identifier: 'GB-7',
          url: 'https://linear.app/x',
          title: 'mapped task',
          createdAt: '2026-06-22T00:00:00.000Z',
        },
      ],
    };
    renderBar([], [makeSession('a-1', 'active one')]);
    expect(screen.queryByLabelText(/GB-7 from Linear/i)).toBeNull();
    expect(screen.queryByRole('img', { name: 'Linear' })).toBeNull();
    expect(screen.getByTitle(/active one · idle · GB-7/)).toBeDefined();
  });

  it('retains a non-linear identifier in the item title without a glyph', () => {
    state.sessionExternalTasks = {
      'a-1': [
        {
          sessionId: 'a-1',
          provider: 'sentry',
          externalId: 'ext-2',
          identifier: 'SENTRY-9',
          url: 'https://sentry.io/x',
          title: 'crash',
          createdAt: '2026-06-22T00:00:00.000Z',
        },
      ],
    };
    renderBar([], [makeSession('a-1', 'crashy')]);
    expect(screen.queryByRole('img', { name: 'Sentry' })).toBeNull();
    expect(screen.queryByLabelText(/SENTRY-9 from Sentry/i)).toBeNull();
    expect(screen.getByTitle(/crashy · idle · SENTRY-9/)).toBeDefined();
  });
});
