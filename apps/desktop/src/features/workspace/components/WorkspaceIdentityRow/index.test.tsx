// @vitest-environment happy-dom

import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Workspace, WorkspaceId } from '@goodboy/types';

const { workspaceRef } = vi.hoisted(() => ({
  workspaceRef: {
    value: {
      id: 'ws-1' as WorkspaceId,
      name: 'Acme',
      slug: 'acme',
      sessionsRoot: '/code/monorepo',
    } as Workspace | null,
  },
}));

vi.mock('../../../../store', () => ({
  useCurrentWorkspace: () => workspaceRef.value,
  useHasUnreadElsewhere: () => false,
  useWorkspaces: () => (workspaceRef.value ? [workspaceRef.value] : []),
  useWorkspaceHasUnread: () => false,
  useAppStore: (
    selector: (s: {
      projects: ReadonlyArray<{ id: string; workspaceId: string; kind: string; rootPath: string }>;
      openWorkspace: () => Promise<void>;
    }) => unknown,
  ) =>
    selector({
      projects: [{ id: 'proj-1', workspaceId: 'ws-1', kind: 'repo', rootPath: '/code/monorepo' }],
      openWorkspace: async () => undefined,
    }),
}));

import { WorkspaceIdentityRow } from './index';
import { shortcutGlyphs } from '../../../../shared/keyboard/registry';

afterEach(cleanup);

describe('WorkspaceIdentityRow', () => {
  it('names the workspace and keeps the repo out of the strip', () => {
    render(<WorkspaceIdentityRow />);

    expect(screen.getByText('Acme')).toBeDefined();
    expect(screen.queryByText('monorepo')).toBeNull();
  });

  it('carries the linked project count and the switcher shortcut in the title', () => {
    render(<WorkspaceIdentityRow />);

    expect(screen.getByLabelText('Switch workspace: Acme').getAttribute('title')).toBe(
      `Acme, 1 linked project (${shortcutGlyphs('workspace.switcher')})`,
    );
  });

  it('opens the selector as a popover, not a full-screen layer', () => {
    render(<WorkspaceIdentityRow />);
    const trigger = screen.getByLabelText('Switch workspace: Acme');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('New workspace')).toBeDefined();
  });

  it('answers the global switcher shortcut', () => {
    render(<WorkspaceIdentityRow />);

    act(() => {
      window.dispatchEvent(new CustomEvent('goodboy:open-workspace-switcher'));
    });

    expect(screen.getByText('New workspace')).toBeDefined();
  });

  it('opens preferences from a control on the row, not from the switcher popover', () => {
    render(<WorkspaceIdentityRow />);
    const spy = vi.fn();
    window.addEventListener('goodboy:open-settings', spy);

    fireEvent.click(screen.getByLabelText('Preferences'));

    expect(spy).toHaveBeenCalledOnce();
    window.removeEventListener('goodboy:open-settings', spy);
  });

  it('renders nothing without a workspace', () => {
    workspaceRef.value = null;
    const { container } = render(<WorkspaceIdentityRow />);

    expect(container.firstChild).toBeNull();
    workspaceRef.value = {
      id: 'ws-1' as WorkspaceId,
      name: 'Acme',
      slug: 'acme',
      sessionsRoot: '/code/monorepo',
    } as Workspace;
  });
});
