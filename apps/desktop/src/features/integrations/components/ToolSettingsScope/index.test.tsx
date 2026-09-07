import { invoke } from '@tauri-apps/api/core';
import userEvent from '@testing-library/user-event';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import type {
  IntegrationBinding,
  IntegrationBindingId,
  IntegrationCredentialId,
  IsoDateTime,
  WorkspaceId,
} from '@goodboy/types';
import { ToolSettingsScope } from '.';
import { TrackerStudioLinks } from '../TrackerStudioLinks';

const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const LINEAR: IntegrationBinding = {
  id: 'binding-1' as IntegrationBindingId,
  workspaceId: WORKSPACE_ID,
  projectId: null,
  credentialId: 'credential-1' as IntegrationCredentialId,
  createdAt: '2026-09-01' as IsoDateTime,
  updatedAt: '2026-09-01' as IsoDateTime,
  provider: 'linear',
  config: { viewerName: 'Ada', viewerUserId: 'ada', workspaceUrlKey: 'acme' },
};

const BINDINGS = [
  LINEAR,
  {
    ...LINEAR,
    provider: 'gitlab',
    config: { userName: 'Ada', userId: 'ada', host: 'https://gitlab.com' },
  },
  {
    ...LINEAR,
    provider: 'bitbucket',
    config: { email: 'ada@example.com', displayName: 'Ada', workspaceSlug: 'acme' },
  },
  {
    ...LINEAR,
    provider: 'jira',
    config: {
      email: 'ada@example.com',
      displayName: 'Ada',
      siteUrl: 'https://acme.atlassian.net',
      projectKey: 'ENG',
    },
  },
  {
    ...LINEAR,
    provider: 'sentry',
    config: { org: 'acme', project: 'desktop', projectName: 'Desktop' },
  },
  {
    ...LINEAR,
    provider: 'slack',
    config: { teamName: 'Acme', teamId: 'acme', botUserId: 'ada', botUserName: 'Ada' },
  },
] satisfies ReadonlyArray<IntegrationBinding>;

const github = vi.hoisted(() => ({ mode: 'absent', scoped: false, user: null as string | null }));

const store = create(() => ({
  currentWorkspaceId: WORKSPACE_ID,
  workspaceIntegrations: {} as Record<string, ReadonlyArray<IntegrationBinding>>,
  integrationCredentials: [],
  integrationCredentialUsage: {},
  forgetIntegrationCredential: vi.fn(),
  disconnectIntegration: vi.fn(async () => undefined),
  connectLinear: vi.fn(async () => undefined),
}));

vi.mock('../../../../store', () => ({
  useAppStore: Object.assign(
    <T,>(selector: (state: ReturnType<typeof store.getState>) => T) => store(selector),
    {
      getState: () => store.getState(),
    },
  ),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => (command === 'gh_status' ? { ...github } : true)),
}));

beforeEach(() => {
  github.mode = 'absent';
  github.scoped = false;
  github.user = null;
  vi.mocked(invoke).mockClear();
  store.setState({ workspaceIntegrations: {} });
  store.getState().connectLinear.mockReset();
  store.getState().disconnectIntegration.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ToolSettingsScope', () => {
  it('renders every tool in footer order', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} />);
    });
    const rail = screen.getByRole('complementary', { name: 'Tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual([
      'GitHubnot connected',
      'GitLabnot connected',
      'Bitbucketnot connected',
      'Linearnot connected',
      'Jiranot connected',
      'Sentrynot connected',
      'Slacknot connected',
    ]);
  });

  it.each([
    { tool: 'linear', label: 'Linear', field: 'Personal API key', id: 'linear-pat' },
    { tool: 'jira', label: 'Jira', field: 'Personal API key', id: 'jira-token' },
    { tool: 'gitlab', label: 'GitLab', field: 'Personal API key', id: 'gitlab-pat' },
    { tool: 'bitbucket', label: 'Bitbucket', field: 'Personal API key', id: 'bitbucket-token' },
    { tool: 'sentry', label: 'Sentry', field: 'Personal API key', id: 'sentry-token' },
    { tool: 'slack', label: 'Slack', field: 'User token', id: 'slack-token' },
  ])('focuses the $tool form from the rail', async ({ label, field, id }) => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} />);
    });
    fireEvent.click(screen.getByRole('button', { name: `${label} not connected` }));
    expect(screen.getByLabelText(field).id).toBe(id);
    expect(screen.getByLabelText(field)).toBe(document.activeElement);
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([label]);
  });

  it('lands initialFocus on the requested tool', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="slack" />);
    });
    expect(screen.getByLabelText('User token')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Slack not connected' }).getAttribute('aria-current'),
    ).toBe('true');
  });

  it('shows the connected identity and confirms disconnect', async () => {
    store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: [LINEAR] } });
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="linear" />);
    });
    expect(screen.getByText('Connected as Ada')).toBeDefined();
    expect(screen.getByText('linear.app/acme')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Linear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Linear' }));
    await waitFor(() =>
      expect(store.getState().disconnectIntegration).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        provider: 'linear',
      }),
    );
  });

  it('flips the form to the connected view when connecting updates the binding', async () => {
    store.getState().connectLinear.mockImplementation(async () => {
      store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: [LINEAR] } });
    });
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="linear" />);
    });
    fireEvent.change(screen.getByLabelText('Personal API key'), { target: { value: 'test-key' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Connect' })));
    expect(screen.getByText('Connected as Ada')).toBeDefined();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in inbox' })).toBeDefined();
  });

  it('opens connected tools in the inbox', async () => {
    store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: [LINEAR] } });
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="linear" />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open in inbox' }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goodboy:open-inbox', detail: { provider: 'linear' } }),
    );
  });

  it.each([
    {
      provider: 'gitlab',
      identity: 'Connected as Ada',
      secondary: 'https://gitlab.com',
      label: 'GitLab',
    },
    {
      provider: 'bitbucket',
      identity: 'Connected as Ada',
      secondary: 'bitbucket.org/acme',
      label: 'Bitbucket',
    },
    {
      provider: 'jira',
      identity: 'Connected as Ada',
      secondary: 'https://acme.atlassian.net (ENG)',
      label: 'Jira',
    },
    {
      provider: 'sentry',
      identity: 'Connected to Desktop',
      secondary: 'acme/desktop',
      label: 'Sentry',
    },
    { provider: 'slack', identity: 'Connected to Acme', secondary: 'as Ada', label: 'Slack' },
  ] satisfies ReadonlyArray<{
    provider: 'gitlab' | 'bitbucket' | 'jira' | 'sentry' | 'slack';
    identity: string;
    secondary: string;
    label: string;
  }>)(
    'preserves $provider identity and disconnect behavior',
    async ({ provider, identity, secondary, label }) => {
      store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: BINDINGS } });
      await act(async () => {
        render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus={provider} />);
      });
      expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([label]);
      expect(screen.getByText(identity)).toBeDefined();
      expect(screen.getAllByText(secondary).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: `Disconnect ${label}` }));
      fireEvent.click(screen.getByRole('button', { name: `Disconnect ${label}` }));
      await waitFor(() =>
        expect(store.getState().disconnectIntegration).toHaveBeenCalledWith({
          workspaceId: WORKSPACE_ID,
          provider,
        }),
      );
    },
  );

  it('defaults to the first unconnected tool after GitHub resolves', async () => {
    github.mode = 'gh-cli';
    github.user = 'Ada';
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} />);
    });
    await waitFor(() => expect(screen.getByLabelText('Personal API key').id).toBe('gitlab-pat'));
    expect(
      screen.getByRole('button', { name: 'GitLab not connected' }).getAttribute('aria-current'),
    ).toBe('true');
  });

  it.each([undefined, 'linear'] satisfies ReadonlyArray<'linear' | undefined>)(
    'holds the detail empty until GitHub resolves with initial focus %s',
    async (initialFocus) => {
      let resolveStatus: (status: unknown) => void = () => undefined;
      vi.mocked(invoke).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStatus = resolve;
          }),
      );
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus={initialFocus} />);
      expect(screen.queryByRole('heading')).toBeNull();
      expect(screen.queryByLabelText('Personal API key')).toBeNull();
      expect(
        within(screen.getByRole('complementary', { name: 'Tools' }))
          .getAllByRole('button')
          .every((button) => button.getAttribute('aria-current') !== 'true'),
      ).toBe(true);
      await act(async () => resolveStatus({ mode: 'gh-cli', user: 'Ada', scoped: false }));
      expect(screen.getByLabelText('Personal API key').id).toBe(
        initialFocus === 'linear' ? 'linear-pat' : 'gitlab-pat',
      );
      expect(screen.getByLabelText('Personal API key')).toBe(document.activeElement);
    },
  );

  it('keeps one title and switches its subtitle when the connection changes', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="linear" />);
    });
    const title = screen.getByRole('heading', { name: 'Linear' });
    expect(title.parentElement?.textContent).toBe('LinearConnect Linear');
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    act(() => store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: [LINEAR] } }));
    expect(title.parentElement?.textContent).toBe('LinearAda · acme');
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('connects GitHub with a workspace key without requiring the CLI', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    fireEvent.change(screen.getByLabelText('Personal API key'), { target: { value: 'test-key' } });
    github.mode = 'pat';
    github.user = 'Ada';
    github.scoped = true;
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('workspace key')).toBeDefined();
    expect(invoke).toHaveBeenCalledWith('gh_set_token', {
      token: 'test-key',
      workspaceId: WORKSPACE_ID,
    });
    expect(screen.getByText('Connected as Ada')).toBeDefined();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)).toEqual([
      'GitHub',
    ]);
  });

  it('honors a global GitHub key and identifies its source', async () => {
    github.mode = 'pat';
    github.user = 'Ada';
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    expect(screen.getByText('Connected as Ada via the global GitHub key')).toBeDefined();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect GitHub' })).toBeNull();
  });

  it('defaults to the first tool when every tool is connected', async () => {
    github.mode = 'gh-cli';
    github.user = 'Ada';
    store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: BINDINGS } });
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} />);
    });
    expect(await screen.findByText('Connected as Ada via the system gh CLI')).toBeDefined();
    expect(screen.getByRole('button', { name: 'GitHub Ada' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Disconnect GitHub' })).toBeNull();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
  });

  it('offers CLI instructions and refreshes the GitHub connection', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    expect(await screen.findByText('GitHub is not connected')).toBeDefined();
    expect(screen.getByText('gh auth login')).toBeDefined();
    expect(screen.getByLabelText('Personal API key').id).toBe('github-pat');
    github.mode = 'gh-cli';
    github.user = 'Ada';
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));
    expect(await screen.findByText('Connected as Ada via the system gh CLI')).toBeDefined();
  });

  it('preserves the existing scoped GitHub disconnect action', async () => {
    github.mode = 'pat';
    github.scoped = true;
    github.user = 'Ada';
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    expect(await screen.findByText('Connected as Ada')).toBeDefined();
    expect(screen.getByText('workspace key')).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Disconnect GitHub' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect GitHub' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('gh_clear_token', { workspaceId: WORKSPACE_ID }),
    );
  });

  it('shares the resolved GitHub status with its token form', async () => {
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    expect(screen.getByLabelText('Personal API key')).toBeDefined();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('gh_status', { workspaceId: WORKSPACE_ID });
  });

  it('reaches a connection form using the keyboard', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<ToolSettingsScope workspaceId={WORKSPACE_ID} initialFocus="github" />);
    });
    await screen.findByText('GitHub is not connected');
    screen.getByRole('button', { name: 'GitHub not connected' }).focus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Personal API key').id).toBe('gitlab-pat');
    expect(screen.getByLabelText('Personal API key')).toBe(document.activeElement);
  });

  it.each([false, true])('routes tracker links with connection state %s', async (isConnected) => {
    store.setState({ workspaceIntegrations: { [WORKSPACE_ID]: isConnected ? [LINEAR] : [] } });
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(
      <TrackerStudioLinks
        connected={{
          linear: isConnected,
          github: false,
          gitlab: false,
          jira: false,
          sentry: false,
        }}
        links={[{ provider: 'linear', label: 'Linear', issueExternalId: 'issue-1' }]}
      />,
    );
    const label = isConnected ? 'Open Linear in the inbox' : 'Connect Linear';
    const button = screen.getByRole('button', { name: label });
    fireEvent.mouseEnter(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe(label);
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining(
        isConnected
          ? {
              type: 'goodboy:open-inbox',
              detail: { provider: 'linear', kind: 'issue', recordKey: 'linear:issue:issue-1' },
            }
          : { type: 'goodboy:open-settings', detail: { scope: 'tools', tool: 'linear' } },
      ),
    );
  });
});
