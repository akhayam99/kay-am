// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@goodboy/types';
import type { OrphanWorktree } from '../../worktree';

const { state, showToast } = vi.hoisted(() => ({
  state: {
    orphanWorktrees: {} as Record<string, ReadonlyArray<OrphanWorktree>>,
    removeOrphanWorktrees: vi.fn(async () => undefined),
  },
  showToast: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

import { OrphanWorktreesSection } from './index';

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

const orphan = (name: string): OrphanWorktree => ({
  path: `/repo/.goodboy/worktrees/${name}`,
  name,
  sizeBytes: 1024,
  isRegistered: false,
});

beforeEach(() => {
  state.orphanWorktrees = {};
  showToast.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('OrphanWorktreesSection folder count copy', () => {
  it('renders nothing at zero orphans', () => {
    state.orphanWorktrees = { [WORKSPACE_ID]: [] };
    const { container } = render(<OrphanWorktreesSection workspaceId={WORKSPACE_ID} />);
    expect(container.firstChild).toBeNull();
  });

  it('singularizes the delete label at one orphan', () => {
    state.orphanWorktrees = { [WORKSPACE_ID]: [orphan('a')] };
    render(<OrphanWorktreesSection workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText(/Delete 1 folder \(/)).toBeDefined();
  });

  it('pluralizes the delete label at two orphans', () => {
    state.orphanWorktrees = { [WORKSPACE_ID]: [orphan('a'), orphan('b')] };
    render(<OrphanWorktreesSection workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText(/Delete 2 folders \(/)).toBeDefined();
  });
});
