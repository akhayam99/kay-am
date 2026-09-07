// @vitest-environment happy-dom

import type { IsoDateTime, Workspace, WorkspaceId } from '@goodboy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { scrollIntoViewMock, state, toastMock } = vi.hoisted(() => ({
  scrollIntoViewMock: vi.fn(),
  state: {
    loadSetting: vi.fn(async () => null),
    saveSetting: vi.fn(async () => undefined),
    exportConfig: vi.fn(async () => null),
    importConfig: vi.fn(async () => null),
    wipeLocalDatabase: vi.fn(async () => undefined),
    loadDetectedEditors: vi.fn(async () => undefined),
    detectedEditors: [] as ReadonlyArray<{ binary: string; label: string }>,
    workspaceIntegrations: {},
    integrationCredentials: [],
    integrationCredentialUsage: {},
    forgetIntegrationCredential: vi.fn(),
    connectLinear: vi.fn(),
    disconnectIntegration: vi.fn(),
    disconnectGithub: vi.fn(),
    storageStats: null,
    storageStatsLoading: false,
    loadStorageStats: vi.fn(async () => undefined),
    pruneArchivedTranscripts: vi.fn(async () => 0),
    removeArchivedWorktrees: vi.fn(async () => ({ removed: 0, failed: 0 })),
  },
  toastMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => ({ mode: 'absent', available: false, scoped: false })),
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: [],
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
  useSessions: () => [],
}));

vi.mock('../../../providers/components/ProviderStudio', () => ({
  ProviderSettingsScope: () => <div>Provider settings content</div>,
}));

vi.mock('./WorkspaceScopePanel', () => ({
  WorkspaceScopePanel: () => <div>Workspace settings content</div>,
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: toastMock }),
}));

vi.mock('../../../../features/github/components/Panel', () => ({
  GithubPanel: () => <div>GitHub token controls</div>,
}));

vi.mock('../ImportConfigDialog', () => ({
  ImportConfigDialog: () => null,
}));

vi.mock('../../../onboarding/onboarding-store', () => ({
  reopenWizard: vi.fn(),
}));

import { SettingsStudio } from './index';
import { REPORT_ISSUE_STUDIO_EVENT } from '../../reportIssueStudioEvent';
import { SHORTCUTS, shortcutGlyphs } from '../../../../shared/keyboard/registry';

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
  scrollIntoViewMock.mockReset();
  state.loadSetting.mockClear();
  state.loadDetectedEditors.mockClear();
  toastMock.mockReset();
});

afterEach(cleanup);

describe('SettingsStudio', () => {
  it('opens the actual tool form from a focused settings request', async () => {
    const workspace: Workspace = {
      id: 'workspace-1' as WorkspaceId,
      name: 'Workspace',
      slug: 'workspace',
      sessionsRoot: null,
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
      createdAt: '2026-09-01' as IsoDateTime,
      updatedAt: '2026-09-01' as IsoDateTime,
    };
    render(
      <SettingsStudio
        currentWorkspace={workspace}
        initialFocus={{ scope: 'tools', tool: 'linear' }}
        onClose={vi.fn()}
      />,
    );
    expect((await screen.findByLabelText('Personal API key')).id).toBe('linear-pat');
    expect(screen.getByRole('button', { name: 'Tools' }).getAttribute('aria-current')).toBe('true');
  });

  it('renders all settings scopes in a navigation rail', () => {
    render(
      <SettingsStudio currentWorkspace={null} initialFocus={{ scope: 'app' }} onClose={vi.fn()} />,
    );

    expect(
      ['Editor', 'Shortcuts', 'GitHub', 'Config backup', 'Help', 'Danger zone'].map(
        (label) => screen.getByText(label).textContent,
      ),
    ).toEqual(['Editor', 'Shortcuts', 'GitHub', 'Config backup', 'Help', 'Danger zone']);
    expect(screen.getByRole('navigation', { name: /settings scopes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: 'App' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Providers & models' })).toBeDefined();
  });

  it('collapses shortcuts by default', () => {
    render(
      <SettingsStudio currentWorkspace={null} initialFocus={{ scope: 'app' }} onClose={vi.fn()} />,
    );

    const toggle = screen.getByRole('button', { name: /expand keyboard shortcuts/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText(`${Object.keys(SHORTCUTS).length} shortcuts`)).toBeDefined();
    expect(screen.queryByText('Command palette')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Command palette')).toBeDefined();
    expect(screen.getByText(shortcutGlyphs('lens.agents'))).toBeDefined();
  });

  it('expands and scrolls to shortcuts when focused', () => {
    render(
      <SettingsStudio
        currentWorkspace={null}
        initialFocus={{ scope: 'app', section: 'shortcuts' }}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('button', { name: /collapse keyboard shortcuts/i })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByText('Command palette')).toBeDefined();
    expect(scrollIntoViewMock.mock.contexts.at(-1)).toBe(document.getElementById('shortcuts'));
  });

  it('explains the scope of the GitHub token in one line', () => {
    render(
      <SettingsStudio currentWorkspace={null} initialFocus={{ scope: 'app' }} onClose={vi.fn()} />,
    );

    expect(screen.getByText('Global fallback token used by every workspace.')).toBeDefined();
    expect(
      screen.queryByText('Per-workspace overrides live in Workspace settings, Integrations.'),
    ).toBeNull();
  });

  it('opens the report issue studio through the shared studio event', () => {
    const listener = vi.fn();
    window.addEventListener(REPORT_ISSUE_STUDIO_EVENT, listener);
    render(
      <SettingsStudio currentWorkspace={null} initialFocus={{ scope: 'app' }} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /report an issue/i }));

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(REPORT_ISSUE_STUDIO_EVENT, listener);
  });

  it.each(['editor', 'integrations', 'advanced', 'initialization'])(
    'resolves the %s deep link',
    (section) => {
      render(
        <SettingsStudio
          currentWorkspace={null}
          initialFocus={{ scope: 'app', section }}
          onClose={vi.fn()}
        />,
      );

      expect(scrollIntoViewMock.mock.contexts.at(-1)).toBe(document.getElementById(section));
    },
  );
});
