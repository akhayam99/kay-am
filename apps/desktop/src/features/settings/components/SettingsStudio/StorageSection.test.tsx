// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { state, toastMock } = vi.hoisted(() => ({
  state: {
    storageStats: {
      databaseBytes: 233_000_000,
      archivedSessionCount: 3,
      archivedTranscriptRows: 12_481,
      archivedTranscriptBytes: 77_000_000,
      archivedWorktrees: [
        {
          sessionId: 'session-archived',
          mountId: 'mount-archived',
          repoPath: '/repo',
          worktreePath: '/repo/.goodboy/worktrees/archived',
          branch: 'ak/archived',
          revision: 0,
          sizeBytes: 4096,
        },
      ],
      retainedWorktrees: [
        {
          id: 'retained-1',
          repoRoot: '/repo',
          worktreePath: '/repo/.goodboy/worktrees/kept',
          branch: 'ak/kept',
          reason: 'session_delete',
          sizeBytes: 2048,
        },
      ],
    },
    storageStatsLoading: false,
    loadStorageStats: vi.fn(async () => undefined),
    reconcileOrphanWorktrees: vi.fn(async () => undefined),
    pruneArchivedTranscripts: vi.fn(async () => 12_481),
    removeArchivedWorktrees: vi.fn(async () => ({ removed: 1, failed: 0 })),
  },
  toastMock: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: toastMock }),
}));

import { StorageSection } from './StorageSection';

beforeEach(() => {
  state.storageStats.archivedSessionCount = 3;
  state.storageStats.archivedTranscriptRows = 12_481;
  state.loadStorageStats.mockClear();
  state.reconcileOrphanWorktrees.mockClear();
  state.pruneArchivedTranscripts.mockClear();
  state.removeArchivedWorktrees.mockClear();
  toastMock.mockReset();
});

afterEach(cleanup);

describe('StorageSection', () => {
  it('shows the archived footprint and the worktree paths', () => {
    render(<StorageSection />);

    expect(screen.getByText('222.2 MB')).toBeDefined();
    expect(screen.getByText('12,481 rows')).toBeDefined();
    expect(screen.getByText('/repo/.goodboy/worktrees/archived')).toBeDefined();
  });

  it('requires a confirmation before pruning transcripts', async () => {
    render(<StorageSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Prune archived transcripts' }));
    expect(state.pruneArchivedTranscripts).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Final messages stay in the database\. This cannot be undone\./),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Prune' }));
    await waitFor(() => expect(state.pruneArchivedTranscripts).toHaveBeenCalledTimes(1));
  });

  it('requires a confirmation before removing worktrees', async () => {
    render(<StorageSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove archived worktrees' }));
    expect(state.removeArchivedWorktrees).not.toHaveBeenCalled();
    expect(screen.getByText(/Uncommitted changes in those folders are lost\./)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(state.removeArchivedWorktrees).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove archived worktrees' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(state.removeArchivedWorktrees).toHaveBeenCalledTimes(1));
  });

  it('groups every count under the app locale, never the operating system one', () => {
    const toLocaleString = Number.prototype.toLocaleString;
    const italian = vi.spyOn(Number.prototype, 'toLocaleString').mockImplementation(function (
      this: number,
      locales?: Intl.LocalesArgument,
      options?: Intl.NumberFormatOptions,
    ) {
      return toLocaleString.call(this, locales ?? 'it-IT', options);
    });

    render(<StorageSection />);

    expect(screen.getByText('12,481 rows')).toBeDefined();
    italian.mockRestore();
  });

  it('says row, session and folder in the singular when the count is one', () => {
    state.storageStats.archivedSessionCount = 1;
    state.storageStats.archivedTranscriptRows = 1;

    render(<StorageSection />);

    expect(screen.getByText('1 row')).toBeDefined();
    expect(screen.getAllByText('1 folder')).toHaveLength(2);
    expect(screen.getByText(/Streamed events of 1 archived session\./)).toBeDefined();
  });
});
