import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IsoDateTime, Session, SessionId, Workspace, WorkspaceId } from '@goodboy/types';

const { currentWorkspace, hooks, store } = vi.hoisted(() => {
  const workspace = {
    id: 'ws-1' as WorkspaceId,
    name: 'Test WS',
    slug: 'test-ws',
    sessionsRoot: '/code/test-ws',
    overrides: {
      defaultProviderId: null,
      defaultWorkflowId: null,
      defaultBranchPrefix: null,
      parallelEnabled: null,
      defaultVerbosity: null,
      providerBindings: null,
      taskModels: null,
      roleModels: null,
      parallelAgents: null,
      providerPool: null,
      attributionFooter: null,
    },
    createdAt: '2026-08-02T08:00:00.000Z' as IsoDateTime,
    updatedAt: '2026-08-02T08:00:00.000Z' as IsoDateTime,
  } satisfies Workspace;
  return {
    currentWorkspace: workspace,
    hooks: {
      sessions: [] as ReadonlyArray<Session>,
      groups: [] as ReadonlyArray<{
        readonly key: string;
        readonly sessions: ReadonlyArray<Session>;
      }>,
      rollup: { attentionCount: 0, runningCount: 0, todaySpend: 0 },
      reasons: {} as Record<string, string>,
      attention: {} as Record<string, string | null>,
    },
    store: {
      setCurrentSession: vi.fn(async () => undefined),
      setActiveLens: vi.fn(),
      currentWorkspaceId: workspace.id,
      projectScripts: {} as Record<string, ReadonlyArray<never>>,
      projects: [] as ReadonlyArray<never>,
      scriptRuns: {} as Record<string, never>,
      sessions: [] as ReadonlyArray<Session>,
      updaterStatus: 'available',
      updateVersion: '0.2.0',
      installUpdate: vi.fn(async () => undefined),
    },
  };
});

vi.mock('../../../store', () => ({
  useCurrentWorkspace: () => currentWorkspace,
  useHasUnreadElsewhere: () => false,
  useSessions: () => hooks.sessions,
  useWorkspaceRollup: () => hooks.rollup,
  useStageGroupedSessions: () => hooks.groups,
  useSessionStageInfo: (session: Session) => ({
    stage: 'attention',
    reason: hooks.reasons[session.id] ?? 'Needs attention',
    attention: hooks.attention[session.id] ?? null,
  }),
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
}));

vi.mock('../../../features/notifications/components/NotificationCenter', () => ({
  NotificationCenter: () => <span data-testid="notification-center" />,
}));

vi.mock('../../../features/settings/components/ReportIssuePopover', () => ({
  ReportIssuePopover: () => <span data-testid="report-issue-popover" />,
}));

vi.mock('../../../features/onboarding/OnboardingCard', () => ({
  OnboardingChip: () => <span data-testid="onboarding-chip" />,
}));

vi.mock('../../../shared/components/DogMascot', () => ({
  DogMascot: () => null,
}));

beforeEach(() => {
  hooks.sessions = [];
  hooks.groups = [];
  hooks.rollup = { attentionCount: 0, runningCount: 0, todaySpend: 0 };
  hooks.reasons = {};
  hooks.attention = {};
  store.setCurrentSession.mockClear();
  store.setActiveLens.mockClear();
  useThemeStore.setState({ theme: 'dark' });
});

afterEach(cleanup);

import { AppTopBar } from './index';
import { useThemeStore } from '../../../shared/lib/theme';

const ATTENTION_SESSION_ID = 'session-1' as SessionId;
const ATTENTION_SESSION = {
  id: ATTENTION_SESSION_ID,
  goal: 'Review the failing checks',
} as unknown as Session;

type BarOverrides = {
  readonly onOpenSpend?: () => void;
  readonly showWorkspaceIdentity?: boolean;
};

const renderBar = (overrides: BarOverrides = {}) =>
  render(
    <AppTopBar
      onOpenSpend={overrides.onOpenSpend ?? vi.fn()}
      showWorkspaceIdentity={overrides.showWorkspaceIdentity ?? false}
    />,
  );

describe('AppTopBar', () => {
  it('mounts the onboarding reopen chip, which the card tooltip points at', () => {
    renderBar({ onOpenSpend: vi.fn() });

    expect(screen.getByTestId('onboarding-chip')).toBeDefined();
  });

  it('seats the report control ahead of notifications, leaving theme beside them', () => {
    renderBar();

    const report = screen.getByTestId('report-issue-popover');
    const notifications = screen.getByTestId('notification-center');
    const themeToggle = screen.getByRole('button', { name: /switch to (light|dark) mode/i });

    expect(report.compareDocumentPosition(notifications)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(notifications.compareDocumentPosition(themeToggle)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('keeps set-once preferences out of the bar, except theme', () => {
    renderBar({ onOpenSpend: vi.fn() });

    expect(screen.queryByRole('button', { name: /switch to (light|dark) mode/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /pair your iphone/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /getting started/i })).toBeNull();
  });

  it('leaves settings and the update control to the footer', () => {
    renderBar({ onOpenSpend: vi.fn() });

    expect(screen.queryByRole('button', { name: /^open settings/i })).toBeNull();
    expect(screen.queryByTestId('update-indicator')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preferences' })).toBeNull();
  });

  it('flips the real theme state from the top bar', () => {
    useThemeStore.setState({ theme: 'dark' });
    renderBar({ onOpenSpend: vi.fn() });

    const toggle = screen.getByRole('button', { name: 'Switch to light mode' });
    fireEvent.click(toggle);

    expect(useThemeStore.getState().theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeDefined();
  });

  it('carries the brand badge and leaves workspace identity to the sidebar', () => {
    renderBar();

    expect(screen.getByText('Goodboy')).toBeDefined();
    expect(screen.queryByLabelText('Switch or open a workspace')).toBeNull();
  });

  it('mounts the workspace switcher on the board, where no sidebar carries it', () => {
    renderBar({ showWorkspaceIdentity: true });

    expect(screen.getByLabelText('Switch or open a workspace')).toBeDefined();
  });

  it('leaves the column control to the sidebar', () => {
    renderBar();

    expect(screen.queryByRole('button', { name: /session sidebar/i })).toBeNull();
  });

  it('keeps a single spacer holding the rollup strip to the right', () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-tauri-drag-region]');
    const children = Array.from(bar?.children ?? []);

    expect(children.filter((child) => child.className.includes('flex-1')).length).toBe(1);
    expect(children.some((child) => child.className.includes('absolute'))).toBe(false);
  });

  it('leaves session breadcrumbs to the page, not the drag strip', () => {
    renderBar();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('opens the impact studio only from the spend target and omits the beta chip', () => {
    hooks.sessions = [ATTENTION_SESSION];
    hooks.groups = [{ key: 'attention', sessions: [ATTENTION_SESSION] }];
    hooks.rollup = { attentionCount: 1, runningCount: 0, todaySpend: 2.5 };
    const onOpenSpend = vi.fn();
    renderBar({ onOpenSpend });

    fireEvent.click(screen.getByTitle("Today's spend across providers, open the impact studio"));
    expect(onOpenSpend).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '1 session needs you' }));
    expect(onOpenSpend).toHaveBeenCalledOnce();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('lists attention sessions and navigates from the needs-you popover', () => {
    hooks.sessions = [ATTENTION_SESSION];
    hooks.groups = [{ key: 'attention', sessions: [ATTENTION_SESSION] }];
    hooks.rollup = { attentionCount: 1, runningCount: 0, todaySpend: 0 };
    hooks.reasons = { [ATTENTION_SESSION_ID]: 'PR #42: CI failed' };
    renderBar({ onOpenSpend: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: '1 session needs you' }));

    expect(screen.getByText('Needs you')).toBeDefined();
    expect(screen.getByRole('list', { name: 'Sessions needing attention' })).toBeDefined();
    expect(screen.getByText('Review the failing checks')).toBeDefined();
    expect(screen.getByText('PR #42: CI failed')).toBeDefined();

    fireEvent.click(screen.getByTitle('Review the failing checks · PR #42: CI failed'));

    expect(store.setCurrentSession).toHaveBeenCalledWith(ATTENTION_SESSION_ID);
    expect(screen.queryByText('PR #42: CI failed')).toBeNull();
  });

  it('renders the open-question icon and tone instead of the sessions fallback', () => {
    hooks.sessions = [ATTENTION_SESSION];
    hooks.groups = [{ key: 'attention', sessions: [ATTENTION_SESSION] }];
    hooks.rollup = { attentionCount: 1, runningCount: 0, todaySpend: 0 };
    hooks.reasons = { [ATTENTION_SESSION_ID]: 'PR #42: CI failed' };
    hooks.attention = { [ATTENTION_SESSION_ID]: 'open-question' };
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: '1 session needs you' }));

    const row = screen.getByTitle('Review the failing checks · PR #42: CI failed');
    const icon = row.querySelector('svg');
    expect(icon?.getAttribute('class')).toContain('text-warning');
    expect(icon?.getAttribute('class')).toContain('lucide-circle-question-mark');
    expect(icon?.getAttribute('class')).not.toContain('lucide-circle-play');
  });

  it('closes the needs-you dialog on Escape', () => {
    hooks.sessions = [ATTENTION_SESSION];
    hooks.groups = [{ key: 'attention', sessions: [ATTENTION_SESSION] }];
    hooks.rollup = { attentionCount: 1, runningCount: 0, todaySpend: 0 };
    renderBar({ onOpenSpend: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: '1 session needs you' }));
    expect(screen.getByRole('dialog', { name: 'Sessions needing attention' })).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Sessions needing attention' })).toBeNull();
  });
});
