// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const { platform } = vi.hoisted(() => ({ platform: { current: 'darwin' as 'darwin' | 'linux' } }));

vi.mock('../../shared/platform', () => ({ currentPlatform: () => platform.current }));

const { setActiveLens, sessionList, state } = vi.hoisted(() => {
  const activeLensSetter = vi.fn();
  const sessions = [
    { id: 'session-0', workspaceId: 'workspace-1' },
    { id: 'session-1', workspaceId: 'workspace-1' },
  ];
  return {
    setActiveLens: activeLensSetter,
    sessionList: { current: sessions },
    state: {
      hydrate: vi.fn(async () => undefined),
      checkForUpdates: vi.fn(async () => undefined),
      hydrated: false,
      bootPhase: 'loading' as const,
      error: null,
      workspaceIntegrations: {},
      workspaces: [
        {
          id: 'workspace-1',
          name: 'Workspace',
          rootPath: '/repo',
          kind: 'repo' as 'repo' | 'simple',
        },
      ],
      sessions,
      sessionProjectMounts: {},
      sessionActiveProject: {},
      sessionBranches: { 'session-1': 'feature/branch' } as Record<string, string>,
      setSessionStudio: vi.fn(),
      openWorkspace: vi.fn(),
      setCurrentSession: vi.fn(),
      lensGo: vi.fn(),
      currentWorkspaceId: 'workspace-1' as string | null,
      currentSessionId: 'session-1' as string | null,
      activeLens: {} as Record<string, string | null>,
      selectedAgentId: {} as Record<string, string | null>,
      setActiveLens: activeLensSetter,
      sessionWorktrees: {},
    },
  };
});

vi.mock('@goodboy/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@goodboy/ui')>()),
  AppShell: () => null,
}));
vi.mock('../../app/components/AppFooter', () => ({ AppFooter: () => null }));
vi.mock('../../features/session/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('../../app/components/BootSplash', () => ({ BootSplash: () => null }));
vi.mock('../../app/components/KeepAliveWorkSurface', () => ({ KeepAliveWorkSurface: () => null }));
vi.mock('../../app/components/AppTopBar', () => ({ AppTopBar: () => null }));
vi.mock('../../app/components/AppEmptyState', () => ({ NoWorkspaceScreen: () => null }));
vi.mock('../../features/workspace/components/StageBoard', () => ({ StageBoard: () => null }));
vi.mock('../../features/session/components/DeleteSessionConfirm', () => ({
  DeleteSessionConfirm: () => null,
}));
vi.mock('../../features/session/components/ArchiveSessionConfirm', () => ({
  ArchiveSessionConfirm: () => null,
}));
vi.mock('../../features/settings/components/SettingsStudio', () => ({
  SettingsStudio: () => null,
}));
vi.mock('../../features/settings/components/GuideStudio', () => ({ GuideStudio: () => null }));
vi.mock('../../app/components/Toast', () => ({ ToastProvider: () => null }));
vi.mock('../../features/notifications/components/NotificationToastBridge', () => ({
  NotificationToastBridge: () => null,
}));
vi.mock('../../features/session/components/SessionNavSidebar', () => ({
  SessionNavSidebar: () => null,
}));
vi.mock('../../features/workspace/hooks/useWindowPresence', () => ({ useWindowPresence: vi.fn() }));
vi.mock('../../features/workspace/components/WorkspaceLinkStudio', () => ({
  WorkspaceLinkStudio: () => null,
}));
vi.mock('../../features/workspace/components/WorkspaceLauncher', () => ({
  WorkspaceLauncher: () => null,
}));
vi.mock('../../features/workspace/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => null,
}));
vi.mock('../../features/workspace/window', () => ({ isMainWindow: () => true }));
vi.mock('../../features/workflows/components/WorkflowStudio', () => ({
  WorkflowStudio: () => null,
}));
vi.mock('../../features/permissions/components/DiffViewerDialog', () => ({
  DiffViewerDialog: () => null,
}));
vi.mock('../../features/github/github', () => ({ ghCommitDiff: vi.fn() }));
vi.mock('../../features/worktree/worktree', () => ({ worktreeDiffCommit: vi.fn() }));
vi.mock('../../features/onboarding/OnboardingCard', () => ({ OnboardingCard: () => null }));
vi.mock('../../features/onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => null }));
vi.mock('../../features/companion/CompanionStudio', () => ({ CompanionStudio: () => null }));
vi.mock('../../features/companion/commandExecutor', () => ({
  listenBridgeCommands: vi.fn(async () => () => undefined),
}));
vi.mock('../../features/onboarding/onboarding-store', () => ({ markStepComplete: vi.fn() }));
vi.mock('../../shared/lib/zoom', () => ({
  applyStoredZoom: vi.fn(async () => undefined),
  zoomIn: vi.fn(async () => undefined),
  zoomOut: vi.fn(async () => undefined),
  zoomReset: vi.fn(async () => undefined),
}));
vi.mock('../../shared/hooks/useProviderRefreshOnFocus', () => ({
  useProviderRefreshOnFocus: vi.fn(),
}));
vi.mock('../../shared/hooks/useCommitLinkInterceptor', () => ({
  useCommitLinkInterceptor: () => ({ commitDiff: null, setCommitDiff: vi.fn() }),
}));
vi.mock('../../store', () => {
  const useAppStore = Object.assign(
    vi.fn((selector: (store: typeof state) => unknown) => selector(state)),
    { getState: () => state },
  );
  return {
    useAppStore,
    useCurrentSession: () => state.sessions.find((s) => s.id === state.currentSessionId) ?? null,
    useCurrentWorkspace: () => null,
    useSessionById: (sessionId: string | null) =>
      sessionList.current.find((s) => s.id === sessionId) ?? null,
    useSessions: () => sessionList.current,
    useWorkspaces: () => state.workspaces,
  };
});
vi.mock('../../features/github/hooks/useGithubPolling', () => ({ useGithubPolling: vi.fn() }));
vi.mock('../../features/updater/hooks/useUpdaterPolling', () => ({ useUpdaterPolling: vi.fn() }));

import { App } from '../../App';

const reload = vi.fn();

type KeyInit = {
  readonly code: string;
  readonly key?: string;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
};

const press = (init: KeyInit): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
};

beforeEach(() => {
  platform.current = 'darwin';
  state.workspaces = [{ id: 'workspace-1', name: 'Workspace', rootPath: '/repo', kind: 'repo' }];
  state.sessions = [
    { id: 'session-0', workspaceId: 'workspace-1' },
    { id: 'session-1', workspaceId: 'workspace-1' },
  ];
  sessionList.current = state.sessions;
  state.sessionBranches = { 'session-1': 'feature/branch' };
  state.currentWorkspaceId = 'workspace-1';
  state.currentSessionId = 'session-1';
  state.activeLens = {};
  setActiveLens.mockClear();
  state.setCurrentSession.mockClear();
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload, hash: '' },
  });
});

afterEach(() => {
  cleanup();
  setActiveLens.mockClear();
});

describe('App lens shortcuts off darwin', () => {
  beforeEach(() => {
    platform.current = 'linux';
  });

  it('jumps to the agents lens on ctrl, where the command key does not exist', () => {
    render(<App />);

    press({ code: 'KeyA', key: 'a', ctrlKey: true, altKey: true });

    expect(setActiveLens).toHaveBeenCalledWith('session-1', 'agents');
  });

  it('walks to the previous session on ctrl', () => {
    render(<App />);

    press({ code: 'BracketLeft', key: '{', ctrlKey: true, shiftKey: true });

    expect(state.setCurrentSession).toHaveBeenCalledWith('session-0');
  });

  it('reloads on ctrl', () => {
    render(<App />);

    press({ code: 'KeyR', key: 'r', ctrlKey: true });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the command key inert, so nothing double-fires', () => {
    render(<App />);

    press({ code: 'KeyA', key: 'a', metaKey: true, altKey: true });
    press({ code: 'KeyR', key: 'r', metaKey: true });

    expect(setActiveLens).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('App lens shortcuts on darwin', () => {
  it('jumps to the agents lens on the lens plane modifier', () => {
    render(<App />);

    press({ code: 'KeyA', key: 'a', metaKey: true, altKey: true });

    expect(setActiveLens).toHaveBeenCalledWith('session-1', 'agents');
  });

  it('leaves the lens alone when the session sidebar toggles', () => {
    render(<App />);

    press({ code: 'KeyB', key: 'b', metaKey: true });

    expect(setActiveLens).not.toHaveBeenCalled();
  });

  it('toggles back to the overview when the lens is already active', () => {
    state.activeLens = { 'session-1': 'agents' };
    render(<App />);

    press({ code: 'KeyA', key: 'a', metaKey: true, altKey: true });

    expect(setActiveLens).toHaveBeenCalledWith('session-1', null);
  });

  it('reaches Context and every legacy Context region shortcut', () => {
    render(<App />);

    press({ code: 'KeyC', key: 'c', metaKey: true, altKey: true });
    press({ code: 'KeyG', key: 'g', metaKey: true, altKey: true });
    press({ code: 'KeyE', key: 'e', metaKey: true, altKey: true });
    press({ code: 'KeyU', key: 'u', metaKey: true, altKey: true });

    expect(setActiveLens.mock.calls).toEqual([
      ['session-1', 'context'],
      ['session-1', 'goal'],
      ['session-1', 'decisions'],
      ['session-1', 'last_output_summary'],
    ]);
  });

  it('reaches the integration lenses that had no binding before', () => {
    render(<App />);

    press({ code: 'Digit2', key: '2', metaKey: true, altKey: true });
    press({ code: 'Digit3', key: '3', metaKey: true, altKey: true });
    press({ code: 'Digit4', key: '4', metaKey: true, altKey: true });
    press({ code: 'Digit6', key: '6', metaKey: true, altKey: true });

    expect(setActiveLens.mock.calls).toEqual([
      ['session-1', 'linear'],
      ['session-1', 'gitlab_issues'],
      ['session-1', 'slack_threads'],
    ]);
  });

  it('walks to the previous session from the bracket key', () => {
    render(<App />);

    press({ code: 'BracketLeft', key: '{', metaKey: true, shiftKey: true });

    expect(state.setCurrentSession).toHaveBeenCalledWith('session-0');
  });

  it('returns to the board', () => {
    render(<App />);

    press({ code: 'KeyH', key: 'h', metaKey: true, shiftKey: true });

    expect(state.setCurrentSession).toHaveBeenCalledWith(null);
  });

  it('routes the diff binding to the Diff lens for repo-backed sessions', () => {
    render(<App />);

    press({ code: 'KeyF', key: 'f', metaKey: true, altKey: true });
    press({ code: 'KeyX', key: 'x', metaKey: true, altKey: true });

    expect(setActiveLens.mock.calls).toEqual([['session-1', 'files']]);
  });

  it('routes the explore binding to the Explore lens for branchless sessions', () => {
    state.workspaces = [
      { id: 'workspace-1', name: 'Workspace', rootPath: '/simple', kind: 'simple' },
    ];
    state.sessionBranches = { 'session-1': '' };
    render(<App />);

    press({ code: 'KeyX', key: 'x', metaKey: true, altKey: true });
    press({ code: 'KeyF', key: 'f', metaKey: true, altKey: true });

    expect(setActiveLens.mock.calls).toEqual([['session-1', 'explore']]);
  });

  it('reloads on the plain reload combo', () => {
    render(<App />);

    press({ code: 'KeyR', key: 'r', metaKey: true });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the Resolve lens combo fires', () => {
    render(<App />);

    press({ code: 'KeyR', key: 'r', metaKey: true, shiftKey: true });

    expect(reload).not.toHaveBeenCalled();
    expect(setActiveLens).not.toHaveBeenCalled();
  });

  it('reaches the Review lens on the one lens binding it has', () => {
    render(<App />);

    press({ code: 'KeyR', key: 'r', metaKey: true, altKey: true });

    expect(setActiveLens).toHaveBeenCalledWith('session-1', 'review');
    expect(reload).not.toHaveBeenCalled();
  });
});
