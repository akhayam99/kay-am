// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const { state, toastMock } = vi.hoisted(() => ({
  state: {
    loadSetting: vi.fn(async () => null),
    saveSetting: vi.fn(async () => undefined),
    deleteWorkspace: vi.fn(async () => undefined),
    workspaces: [] as ReadonlyArray<{ id: string; name: string; rootPath: string }>,
    renameWorkspace: vi.fn(async () => undefined),
    workspaceOverrides: {} as Record<string, unknown>,
    setWorkspaceOverrides: vi.fn(async () => undefined),
    workspaceIntegrations: {} as Record<string, ReadonlyArray<unknown>>,
    providers: [] as ReadonlyArray<{ id: string; connection: string }>,
    orphanWorktrees: {} as Record<
      string,
      ReadonlyArray<{ path: string; name: string; sizeBytes: number }>
    >,
    removeOrphanWorktrees: vi.fn(async () => undefined),
  },
  toastMock: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (s: typeof state) => T) => selector(state),
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: toastMock }),
}));

vi.mock('../../../../features/skills/components/SkillsPanel', () => ({
  SkillsPanel: () => null,
}));

vi.mock('../../../../features/session/components/VerbositySelect', () => ({
  VerbositySelect: () => null,
}));

vi.mock('../../../../features/chat/utils/chat-constants', () => ({
  PROVIDER_LABEL: { anthropic: 'Claude', cursor: 'Cursor', codex: 'Codex', gemini: 'Gemini' },
}));

vi.mock('../../../../features/providers/components/provider-brand', () => ({
  PROVIDER_BRAND: {
    anthropic: { icon: () => null },
    cursor: { icon: () => null },
    codex: { icon: () => null },
    gemini: { icon: () => null },
  },
  brandColor: () => '#000000',
}));

beforeEach(() => {
  state.loadSetting = vi.fn(async () => null);
  state.saveSetting = vi.fn(async () => undefined);
  state.deleteWorkspace = vi.fn(async () => undefined);
  state.workspaces = [{ id: 'ws-1', name: 'billing', rootPath: '/repos/billing-api' }];
  state.renameWorkspace = vi.fn(async () => undefined);
  state.workspaceOverrides = {};
  state.setWorkspaceOverrides = vi.fn(async () => undefined);
  state.workspaceIntegrations = {};
  state.providers = [];
  state.orphanWorktrees = {};
  state.removeOrphanWorktrees = vi.fn(async () => undefined);
  toastMock.mockReset();
});
afterEach(cleanup);

import { overridesWithAttribution } from '../../../../__tests__/helpers/attributionOverrides';
import { WorkspaceScopePanel } from './WorkspaceScopePanel';

const attributionSwitch = (): HTMLElement => {
  const row = screen.getByText('Attribution line').parentElement?.parentElement;
  if (row == null) {
    throw new Error('attribution row not rendered');
  }
  return within(row).getByRole('switch');
};

describe('WorkspaceScopePanel', () => {
  it('renders the one-page fields without a nav rail', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    expect(screen.getByLabelText(/branch prefix/i)).toBeDefined();
    expect(screen.queryByText(/default provider/i)).toBeNull();
    expect(screen.getByText(/parallel agents/i)).toBeDefined();
    expect(screen.queryByText('Linear')).toBeNull();
    expect(screen.queryByText('GitHub')).toBeNull();
    expect(screen.queryByRole('button', { name: /^general$/i })).toBeNull();
  });

  it('orders the sections projects, profile, session defaults, danger zone', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    const order = ['Projects', 'Profile', 'Session defaults', 'Danger zone'].map((label) =>
      screen.getByText(label),
    );
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(
        order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('folds parallel agents into the session defaults section', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    const section = screen.getByText('Session defaults').closest('section');
    expect(section?.textContent).toContain('Parallel agents');
  });

  it('shows the attribution line as on until the workspace switches it off', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    const section = screen.getByText('Session defaults').closest('section');
    expect(section?.textContent).toContain('Attribution line');
    expect(attributionSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('persists the attribution switch on both edges', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    fireEvent.click(attributionSwitch());

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ attributionFooter: false }),
    );

    cleanup();
    state.workspaceOverrides = {
      'ws-1': overridesWithAttribution({ attributionFooter: false }),
    };
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    expect(attributionSwitch().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(attributionSwitch());

    expect(state.setWorkspaceOverrides).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ attributionFooter: true }),
    );
  });

  it('leaves attribution footer null when saving an unrelated override', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    const input = screen.getByLabelText(/branch prefix/i);
    fireEvent.change(input, { target: { value: 'feature' } });
    fireEvent.blur(input);

    expect(state.setWorkspaceOverrides).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ attributionFooter: null }),
    );
  });

  it('renames the workspace on blur while keeping the folder name as the hint', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    const input = screen.getByLabelText(/display name/i);
    expect((input as HTMLInputElement).value).toBe('billing');
    expect(screen.getByText(/the folder on disk stays the workspace folder/i)).toBeDefined();

    fireEvent.change(input, { target: { value: 'Billing platform' } });
    fireEvent.blur(input);

    expect(state.renameWorkspace).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      name: 'Billing platform',
    });
  });

  it('spends no write on a name that did not change', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    const input = screen.getByLabelText(/display name/i);
    fireEvent.change(input, { target: { value: '  billing  ' } });
    fireEvent.blur(input);

    expect(state.renameWorkspace).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('billing');
  });

  it('shows the disconnect action with inline confirm', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
  });

  it('hides the leftover folders section when there is nothing to clean', () => {
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);
    expect(screen.queryByText(/session folders left on disk/i)).toBeNull();
  });

  it('asks twice before deleting the folders it found', () => {
    state.orphanWorktrees = {
      'ws-1': [{ path: '/repo/.goodboy/worktrees/gb-ghost', name: 'gb-ghost', sizeBytes: 2048 }],
    };
    render(<WorkspaceScopePanel workspaceId={'ws-1' as never} requestClose={vi.fn()} />);

    expect(screen.getByText('gb-ghost')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /delete 1 folder \(2 kb\)/i }));

    expect(state.removeOrphanWorktrees).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(state.removeOrphanWorktrees).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      paths: ['/repo/.goodboy/worktrees/gb-ghost'],
    });
  });
});
