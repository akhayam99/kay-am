// @vitest-environment happy-dom

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const { githubAuth } = vi.hoisted(() => ({ githubAuth: { isAuthenticated: false } }));

vi.mock('../shared/platform', () => ({ currentPlatform: () => 'darwin' }));

const { state, workspace } = vi.hoisted(() => {
  const currentWorkspace = {
    id: 'workspace-1',
    name: 'Workspace',
    rootPath: '/repo',
    kind: 'repo' as const,
  };
  return {
    workspace: currentWorkspace,
    state: {
      hydrate: vi.fn(async () => undefined),
      checkForUpdates: vi.fn(async () => undefined),
      hydrated: true,
      bootPhase: 'ready' as const,
      error: null,
      workspaceIntegrations: {} as Record<string, ReadonlyArray<{ provider: string }>>,
      workspaces: [currentWorkspace],
      sessions: [] as ReadonlyArray<{ id: string; workspaceId: string }>,
      sessionProjectMounts: {},
      sessionActiveProject: {},
      sessionBranches: {} as Record<string, string>,
      setSessionStudio: vi.fn(),
      openWorkspace: vi.fn(),
      setCurrentSession: vi.fn(),
      lensGo: vi.fn(),
      currentWorkspaceId: 'workspace-1' as string | null,
      currentSessionId: null as string | null,
      activeLens: {} as Record<string, string | null>,
      selectedAgentId: {} as Record<string, string | null>,
      setActiveLens: vi.fn(),
      sessionWorktrees: {},
      providers: [] as ReadonlyArray<{ connection: string }>,
    },
  };
});

type ShellProps = {
  readonly topBar?: ReactNode;
  readonly footer?: ReactNode;
};

vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  return {
    ...actual,
    AppShell: ({ topBar, footer }: ShellProps) => (
      <div>
        {topBar}
        {footer}
      </div>
    ),
  };
});

type FooterProps = {
  readonly onOpenLinear: () => void;
  readonly linearEnabled: boolean;
  readonly onOpenSlack: () => void;
  readonly slackEnabled: boolean;
  readonly onOpenBitbucket: () => void;
  readonly bitbucketEnabled: boolean;
  readonly onOpenGithub: () => void;
  readonly githubEnabled: boolean;
  readonly onOpenSettings: () => void;
  readonly onOpenImpact: () => void;
  readonly onOpenChangelog: () => void;
};

vi.mock('../app/components/AppFooter', () => ({
  AppFooter: ({
    onOpenLinear,
    linearEnabled,
    onOpenSlack,
    slackEnabled,
    onOpenBitbucket,
    bitbucketEnabled,
    onOpenGithub,
    githubEnabled,
    onOpenSettings,
    onOpenImpact,
    onOpenChangelog,
  }: FooterProps) => (
    <>
      <button type="button" onClick={onOpenLinear}>
        {linearEnabled ? 'Open Linear' : 'Connect Linear'}
      </button>
      <button type="button" onClick={onOpenSlack}>
        {slackEnabled ? 'Launch a session from a Slack thread' : 'Connect Slack'}
      </button>
      <button type="button" onClick={onOpenBitbucket}>
        {bitbucketEnabled ? 'Review pull requests across this workspace' : 'Connect Bitbucket'}
      </button>
      <button type="button" onClick={onOpenGithub}>
        {githubEnabled ? 'Review pull requests and issues' : 'Connect GitHub'}
      </button>
      <button type="button" onClick={onOpenSettings}>
        Open settings
      </button>
      <button type="button" onClick={onOpenImpact}>
        Open impact
      </button>
      <button type="button" onClick={onOpenChangelog}>
        Open changelog
      </button>
    </>
  ),
}));

vi.mock('../features/integrations/github/useGithubConnection', () => ({
  useGithubConnection: () => ({
    isAuthenticated: githubAuth.isAuthenticated,
    isResolved: true,
    refresh: vi.fn(),
  }),
}));

vi.mock('../features/inbox/components/InboxStudio', () => ({
  InboxStudio: ({
    workspaceName,
    initialProvider,
  }: {
    workspaceName: string;
    initialProvider: string | null;
  }) => <div data-testid="inbox-studio">{`${workspaceName}:${initialProvider ?? 'all'}`}</div>,
}));

type PaletteProps = {
  readonly onOpenProviders?: () => void;
};

vi.mock('../features/session/components/CommandPalette', () => ({
  CommandPalette: ({ onOpenProviders }: PaletteProps) =>
    onOpenProviders ? (
      <button type="button" onClick={onOpenProviders}>
        Connect a provider
      </button>
    ) : null,
}));
vi.mock('../app/components/BootSplash', () => ({
  BootSplash: ({ onFinished }: { onFinished: () => void }) => {
    useEffect(() => {
      onFinished();
    }, [onFinished]);
    return null;
  },
}));
vi.mock('../app/components/KeepAliveWorkSurface', () => ({ KeepAliveWorkSurface: () => null }));
vi.mock('../app/components/AppTopBar', () => ({
  AppTopBar: ({ onOpenSpend }: { onOpenSpend: () => void }) => (
    <button type="button" onClick={onOpenSpend}>
      Open spend
    </button>
  ),
}));
vi.mock('../app/components/AppEmptyState', () => ({ NoWorkspaceScreen: () => null }));
vi.mock('../features/workspace/components/StageBoard', () => ({ StageBoard: () => null }));
vi.mock('../features/session/components/DeleteSessionConfirm', () => ({
  DeleteSessionConfirm: () => null,
}));
vi.mock('../features/session/components/ArchiveSessionConfirm', () => ({
  ArchiveSessionConfirm: () => null,
}));
vi.mock('../features/settings/components/SettingsStudio', () => ({
  SettingsStudio: ({ initialFocus }: { initialFocus: { scope: string; tool?: string } }) => (
    <div
      data-testid="settings-studio"
      data-scope={initialFocus.scope}
      data-tool={initialFocus.tool}
    />
  ),
}));
vi.mock('../features/settings/components/GuideStudio', () => ({ GuideStudio: () => null }));
vi.mock('../features/settings/components/ReportIssueStudio', () => ({
  ReportIssueStudio: () => <div data-testid="report-issue-studio" />,
}));
vi.mock('../app/components/Toast', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../features/notifications/components/NotificationToastBridge', () => ({
  NotificationToastBridge: () => null,
}));
vi.mock('../features/session/components/NewSessionBridge', () => ({
  NewSessionBridge: () => null,
}));
vi.mock('../features/workflows/components/WorkflowFollowToastBridge', () => ({
  WorkflowFollowToastBridge: () => null,
}));
vi.mock('../features/session/components/SessionNavSidebar', () => ({
  SessionNavSidebar: () => null,
}));
vi.mock('../features/workspace/hooks/useWindowPresence', () => ({ useWindowPresence: vi.fn() }));
vi.mock('../features/workspace/components/WorkspaceLinkStudio', () => ({
  WorkspaceLinkStudio: () => null,
}));
vi.mock('../features/workspace/components/WorkspaceLauncher', () => ({
  WorkspaceLauncher: () => null,
}));
vi.mock('../features/workspace/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => null,
}));
vi.mock('../features/workspace/window', () => ({ isMainWindow: () => true }));
vi.mock('../features/workflows/components/WorkflowStudio', () => ({ WorkflowStudio: () => null }));
vi.mock('../features/impact/components/ImpactStudio', () => ({
  ImpactStudio: ({
    workspaceName,
    initialScope,
  }: {
    workspaceName: string;
    initialScope?: { kind: string; sessionId?: string };
  }) => (
    <div
      data-testid="impact-studio"
      data-scope={initialScope?.kind ?? 'none'}
      data-session={initialScope?.sessionId ?? ''}
    >
      {workspaceName}
    </div>
  ),
}));
vi.mock('../features/changelog/components/ChangelogStudio', () => ({
  ChangelogStudio: ({ workspaceName }: { workspaceName: string }) => (
    <div data-testid="changelog-studio">{workspaceName}</div>
  ),
}));
vi.mock('../features/permissions/components/DiffViewerDialog', () => ({
  DiffViewerDialog: () => null,
}));
vi.mock('../features/github/github', () => ({ ghCommitDiff: vi.fn() }));
vi.mock('../features/worktree/worktree', () => ({ worktreeDiffCommit: vi.fn() }));
vi.mock('../features/onboarding/OnboardingCard', () => ({ OnboardingCard: () => null }));
vi.mock('../features/onboarding/OnboardingWizard', () => ({ OnboardingWizard: () => null }));
vi.mock('../features/companion/CompanionStudio', () => ({ CompanionStudio: () => null }));
vi.mock('../features/companion/commandExecutor', () => ({
  listenBridgeCommands: vi.fn(async () => () => undefined),
}));
vi.mock('../features/onboarding/onboarding-store', () => ({ markStepComplete: vi.fn() }));
vi.mock('../shared/lib/zoom', () => ({
  applyStoredZoom: vi.fn(async () => undefined),
  zoomIn: vi.fn(async () => undefined),
  zoomOut: vi.fn(async () => undefined),
  zoomReset: vi.fn(async () => undefined),
}));
vi.mock('../shared/hooks/useProviderRefreshOnFocus', () => ({
  useProviderRefreshOnFocus: vi.fn(),
}));
vi.mock('../shared/hooks/useCommitLinkInterceptor', () => ({
  useCommitLinkInterceptor: () => ({ commitDiff: null, setCommitDiff: vi.fn() }),
}));
vi.mock('../store', () => {
  const useAppStore = Object.assign(
    vi.fn((selector: (store: typeof state) => unknown) => selector(state)),
    { getState: () => state },
  );
  return {
    useAppStore,
    useCurrentSession: () => null,
    useCurrentWorkspace: () => workspace,
    useSessionById: () => null,
    useSessions: () => state.sessions,
    useWorkspaces: () => state.workspaces,
  };
});
vi.mock('../features/github/hooks/useGithubPolling', () => ({ useGithubPolling: vi.fn() }));
vi.mock('../features/updater/hooks/useUpdaterPolling', () => ({ useUpdaterPolling: vi.fn() }));

import { App } from '../App';
import { REPORT_ISSUE_STUDIO_EVENT } from '../features/settings/reportIssueStudioEvent';

beforeEach(() => {
  state.workspaceIntegrations = {};
  githubAuth.isAuthenticated = false;
});

afterEach(() => {
  cleanup();
});

describe('Slack studio reachability', () => {
  it('opens the workspace slack studio from the app footer', async () => {
    state.workspaceIntegrations = { 'workspace-1': [{ provider: 'slack' }] };
    render(<App />);

    expect(screen.queryByTestId('inbox-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Launch a session from a Slack thread' }));

    expect((await screen.findByTestId('inbox-studio')).textContent).toBe('Workspace:slack');
  });

  it('opens Tools settings when slack is not connected', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Slack' }));

    expect((await screen.findByTestId('settings-studio')).getAttribute('data-scope')).toBe('tools');
    expect(screen.getByTestId('settings-studio').getAttribute('data-tool')).toBe('slack');
    expect(screen.queryByTestId('inbox-studio')).toBeNull();
  });
});

describe('GitHub footer state', () => {
  it('lights the footer glyph from the workspace credential, whatever the remote is', () => {
    githubAuth.isAuthenticated = true;
    state.workspaceIntegrations = { 'workspace-1': [{ provider: 'gitlab' }] };
    render(<App />);

    expect(screen.getByRole('button', { name: 'Review pull requests and issues' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
  });

  it('leaves the glyph unlit when no github credential resolves', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Review pull requests and issues' })).toBeNull();
  });

  it('still opens the studio when github is not connected, so the connect form is reachable', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    expect(screen.getByTestId('settings-studio').getAttribute('data-scope')).toBe('tools');
    expect(screen.getByTestId('settings-studio').getAttribute('data-tool')).toBe('github');
    expect(screen.queryByTestId('inbox-studio')).toBeNull();
  });
});

describe('Provider studio reachability from the command palette', () => {
  const openPalette = (): void => {
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });
  };

  it('hands the palette a way to open the provider studio', () => {
    render(<App />);

    openPalette();

    expect(screen.getByRole('button', { name: 'Connect a provider' })).toBeDefined();
  });

  it('opens the provider studio when the palette entry is chosen', async () => {
    render(<App />);
    openPalette();

    expect(screen.queryByTestId('settings-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect a provider' }));

    expect((await screen.findByTestId('settings-studio')).getAttribute('data-scope')).toBe(
      'providers',
    );
  });
});

describe('Report issue studio reachability', () => {
  it('mounts the studio when the shared open event fires', async () => {
    render(<App />);

    expect(screen.queryByTestId('report-issue-studio')).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent(REPORT_ISSUE_STUDIO_EVENT));
    });

    expect(await screen.findByTestId('report-issue-studio')).toBeDefined();
  });

  it('closes the settings studio when the report studio takes over', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByTestId('settings-studio')).toBeDefined();

    act(() => {
      window.dispatchEvent(new CustomEvent(REPORT_ISSUE_STUDIO_EVENT));
    });

    expect(screen.queryByTestId('settings-studio')).toBeNull();
    expect(screen.getByTestId('report-issue-studio')).toBeDefined();
  });
});

describe('Bitbucket studio reachability', () => {
  it('opens the workspace bitbucket studio from the app footer', () => {
    state.workspaceIntegrations = { 'workspace-1': [{ provider: 'bitbucket' }] };
    render(<App />);

    expect(screen.queryByTestId('inbox-studio')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review pull requests across this workspace' }),
    );

    expect(screen.getByTestId('inbox-studio').textContent).toBe('Workspace:bitbucket');
  });

  it('still opens the studio when bitbucket is not connected, so the connect form is reachable', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Bitbucket' }));

    expect(screen.getByTestId('settings-studio').getAttribute('data-scope')).toBe('tools');
    expect(screen.getByTestId('settings-studio').getAttribute('data-tool')).toBe('bitbucket');
    expect(screen.queryByTestId('inbox-studio')).toBeNull();
  });
});

describe('Footer to settings and more-popover reachability', () => {
  it('opens settings from the footer settings launcher', () => {
    render(<App />);

    expect(screen.queryByTestId('settings-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByTestId('settings-studio')).toBeDefined();
  });

  it('opens impact from the footer more popover, with no scope forced', async () => {
    render(<App />);

    expect(screen.queryByTestId('impact-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open impact' }));

    const studio = await screen.findByTestId('impact-studio');
    expect(studio.textContent).toBe('Workspace');
    expect(studio.getAttribute('data-scope')).toBe('none');
  });

  it('lands the top bar spend chip on the impact studio overview', async () => {
    render(<App />);

    expect(screen.queryByTestId('impact-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open spend' }));

    expect((await screen.findByTestId('impact-studio')).getAttribute('data-scope')).toBe(
      'overview',
    );
  });

  it('opens changelog from the footer more popover', async () => {
    render(<App />);

    expect(screen.queryByTestId('changelog-studio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open changelog' }));

    expect((await screen.findByTestId('changelog-studio')).textContent).toBe('Workspace');
  });
});

describe('Legacy settings event forwarding', () => {
  it.each([
    ['goodboy:open-workspace-settings', 'workspace'],
    ['goodboy:open-provider-studio', 'providers'],
  ])('forwards %s to the %s settings scope', (eventName, scope) => {
    render(<App />);

    act(() => window.dispatchEvent(new CustomEvent(eventName)));

    expect(screen.getByTestId('settings-studio').getAttribute('data-scope')).toBe(scope);
  });
});

describe('Spend reachability through the impact studio', () => {
  it('opens the impact studio at a session scope from the impact studio event', () => {
    render(<App />);

    act(() =>
      window.dispatchEvent(
        new CustomEvent('goodboy:open-impact-studio', {
          detail: { scope: { kind: 'session', sessionId: 'session-1' } },
        }),
      ),
    );

    const studio = screen.getByTestId('impact-studio');
    expect(studio.getAttribute('data-scope')).toBe('session');
    expect(studio.getAttribute('data-session')).toBe('session-1');
  });

  it('keeps the legacy budget studio event working as an alias', () => {
    render(<App />);

    act(() =>
      window.dispatchEvent(
        new CustomEvent('goodboy:open-budget-studio', {
          detail: { budgetScope: { kind: 'provider', provider: 'anthropic' } },
        }),
      ),
    );

    expect(screen.getByTestId('impact-studio').getAttribute('data-scope')).toBe('provider');
    expect(screen.queryByTestId('settings-studio')).toBeNull();
  });
});

describe('Linear connection routing', () => {
  it('opens Tools settings focused on an unconnected Linear', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect Linear' }));
    expect(screen.getByTestId('settings-studio').getAttribute('data-scope')).toBe('tools');
    expect(screen.getByTestId('settings-studio').getAttribute('data-tool')).toBe('linear');
    expect(screen.queryByTestId('inbox-studio')).toBeNull();
  });

  it('opens the filtered inbox for connected Linear', () => {
    state.workspaceIntegrations = { 'workspace-1': [{ provider: 'linear' }] };
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Linear' }));
    expect(screen.getByTestId('inbox-studio').textContent).toBe('Workspace:linear');
    expect(screen.queryByTestId('settings-studio')).toBeNull();
  });
});
