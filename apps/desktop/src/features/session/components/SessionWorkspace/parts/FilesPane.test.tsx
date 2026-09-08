// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DIFF_CAPPED_COLUMN_CLASS } from '../../../../permissions/components/DiffViewerDialog/lib';
import type { BranchCommit, ProjectId, SessionId, SessionProjectMount } from '@goodboy/types';
import {
  openDiffLens,
  setActiveLens,
  setDiffFocus,
} from '../../../../../store/slices/session-view/workSurface';
import type { GetFn, SetFn } from '../../../../../store/slices/session-view/types';
import type { MountDiffStat } from '../../../../../store/selectors';

const SESSION_ID = 'ses-1' as SessionId;

type State = Record<string, unknown>;

const state: State = {};

let diffStats: ReadonlyMap<string, MountDiffStat> = new Map();

let reportDiffEmpty: ((isEmpty: boolean) => void) | undefined;

const { listBranchCommits, amendSessionCommit, squashSessionCommits } = vi.hoisted(() => ({
  listBranchCommits: vi.fn(async () => [] as ReadonlyArray<BranchCommit>),
  amendSessionCommit: vi.fn(async () => undefined),
  squashSessionCommits: vi.fn(async () => undefined),
}));

vi.mock('../../../../worktree/worktree', () => ({ listBranchCommits }));

const mountOf = ({
  name,
  worktreePath,
}: {
  readonly name: string;
  readonly worktreePath: string;
}): SessionProjectMount => ({
  projectId: `prj-${name}` as ProjectId,
  mountName: name,
  worktreePath,
  repoRoot: `/repos/${name}`,
  branch: 'main',
});

const API_MOUNT = mountOf({ name: 'api', worktreePath: '/wt/api' });
const WEB_MOUNT = mountOf({ name: 'web', worktreePath: '/wt/web' });

const set = ((updater: unknown) => {
  const patch = typeof updater === 'function' ? (updater as (s: State) => State)(state) : updater;
  Object.assign(state, patch);
}) as unknown as SetFn;

const get = (() => state) as unknown as GetFn;

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (s: State) => T) => selector(state),
  useMountDiffStats: () => diffStats,
}));

vi.mock('../../../../permissions/components/DiffViewerDialog', () => ({
  DiffViewerPane: ({
    diffFocus,
    worktreePath,
    onContentEmptyChange,
    headerActions,
  }: {
    diffFocus: { readonly kind: string } | null;
    worktreePath?: string;
    onContentEmptyChange?: (isEmpty: boolean) => void;
    headerActions?: React.ReactNode;
  }) => {
    reportDiffEmpty = onContentEmptyChange;
    return (
      <>
        {headerActions}
        <div
          data-testid="diff-viewer"
          data-focus-kind={diffFocus?.kind ?? 'none'}
          data-worktree={worktreePath ?? 'none'}
        />
      </>
    );
  },
}));

vi.mock('./FileVersionsPane', () => ({
  FileVersionsPane: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="file-versions">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

import { FilesPane } from './FilesPane';

const openMountDiff = vi.fn();

const reset = ({ mounts = [] }: { readonly mounts?: ReadonlyArray<SessionProjectMount> } = {}) => {
  for (const key of Object.keys(state)) {
    delete state[key];
  }
  openMountDiff.mockClear();
  amendSessionCommit.mockClear();
  squashSessionCommits.mockClear();
  diffStats = new Map();
  reportDiffEmpty = undefined;
  Object.assign(state, {
    activeLens: {},
    selectedAgentId: {},
    sessionStudio: {},
    diffFocus: {},
    diffMountPath: {},
    resolveDiffReturn: {},
    returnFromResolveDiff: () => undefined,
    focusedWorkflowRunId: {},
    lensHistory: {},
    sessionPhaseRuns: { [SESSION_ID]: [] },
    sessionProjectMounts: { [SESSION_ID]: mounts },
    setDiffFocus: setDiffFocus(set),
    setActiveLens: setActiveLens(set),
    openMountDiff,
    amendSessionCommit,
    squashSessionCommits,
  });
};

const renderPane = ({ worktreePath }: { readonly worktreePath: string | null }) =>
  render(
    <FilesPane
      sessionId={SESSION_ID}
      sessionDir="/tmp/wt"
      worktreePath={worktreePath}
      isBranchless={false}
      onClose={() => undefined}
    />,
  );

const renderBranchlessPane = () =>
  render(
    <FilesPane
      sessionId={SESSION_ID}
      sessionDir="/tmp/wt"
      worktreePath={null}
      isBranchless
      onClose={() => undefined}
    />,
  );

afterEach(cleanup);

describe('FilesPane', () => {
  it('hosts branch surgery and amends the unpushed head commit', async () => {
    listBranchCommits.mockResolvedValueOnce([
      {
        sha: 'abcdef123456',
        shortSha: 'abcdef1',
        subject: 'Old subject',
        author: 'Builder',
        parentSha: 'parent123',
        timestamp: 1,
        pushed: false,
      },
    ]);
    reset();

    renderPane({ worktreePath: '/tmp/wt' });

    const rewrite = await screen.findByRole('button', { name: 'Rewrite branch' });
    fireEvent.click(rewrite);
    fireEvent.click(screen.getByRole('button', { name: 'Reword' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'new message for this commit' }), {
      target: { value: 'New subject' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save message' }));

    await vi.waitFor(() =>
      expect(amendSessionCommit).toHaveBeenCalledWith(SESSION_ID, {
        sha: 'abcdef123456',
        message: 'New subject',
      }),
    );
  });

  it('carries the working tree focus into the diff', () => {
    reset();
    setActiveLens(set)(SESSION_ID, 'review');
    openDiffLens(get)(SESSION_ID, { kind: 'working', path: null });

    renderPane({ worktreePath: '/tmp/wt' });

    expect(screen.getByTestId('diff-viewer').getAttribute('data-focus-kind')).toBe('working');
  });

  it('explains itself when there is no worktree to diff', () => {
    reset();
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: null });

    expect(screen.getByText('No worktree for this session')).toBeTruthy();
  });

  it('shows no mount switcher when the session has a single mount', () => {
    reset({ mounts: [API_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });

    expect(screen.queryByTestId('diff-mount-switcher')).toBeNull();
  });

  it('lists every mount with its diff stat when the session has more than one', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    diffStats = new Map([[WEB_MOUNT.worktreePath, { additions: 4, deletions: 2 }]]);
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });

    expect(screen.getByTestId('diff-mount-switcher')).toBeTruthy();
    expect(screen.getByRole('button', { name: /api/ })).toBeTruthy();
    const web = screen.getByRole('button', { name: /web/ });
    expect(web.textContent).toContain('+4');
    expect(web.textContent).toContain('-2');
    expect(web.getAttribute('data-stat')).toBe('changed');
  });

  it('renders the mounts as one segmented control aligned with the pane column', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });

    const switcher = screen.getByTestId('diff-mount-switcher');
    expect(switcher.className).toContain('rounded-lg');
    expect(switcher.className).toContain('border-border-soft');
    expect(switcher.className).toContain('bg-subtle');
    expect(screen.getAllByTestId('diff-mount-option')).toHaveLength(2);
    for (const cls of DIFF_CAPPED_COLUMN_CLASS.split(' ')) {
      expect(switcher.parentElement?.className).toContain(cls);
    }
    expect(switcher.parentElement?.parentElement?.className).toContain('px-6');
  });

  it('frees the switcher to the full pane width once the diff has files', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });
    act(() => {
      reportDiffEmpty?.(false);
    });

    const wrapper = screen.getByTestId('diff-mount-switcher').parentElement;
    expect(wrapper?.className).not.toContain('max-w-5xl');
    expect(wrapper?.className).not.toContain('mx-auto');
    expect(wrapper?.parentElement?.className).toContain('px-6');
  });

  it('returns the switcher to the capped column when the diff empties again', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });
    act(() => {
      reportDiffEmpty?.(false);
    });
    act(() => {
      reportDiffEmpty?.(true);
    });

    const wrapper = screen.getByTestId('diff-mount-switcher').parentElement;
    for (const cls of DIFF_CAPPED_COLUMN_CLASS.split(' ')) {
      expect(wrapper?.className).toContain(cls);
    }
  });

  it('keeps an untouched mount visible and marks it quiet', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    diffStats = new Map([
      [API_MOUNT.worktreePath, { additions: 0, deletions: 0 }],
      [WEB_MOUNT.worktreePath, { additions: 4, deletions: 2 }],
    ]);
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: WEB_MOUNT.worktreePath });

    const api = screen.getByRole('button', { name: /api/ });
    expect(api.getAttribute('data-stat')).toBe('quiet');
    expect(api.textContent).toContain('no changes');
  });

  it('holds the stat slot open while the counts are still resolving', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    const { rerender } = renderPane({ worktreePath: API_MOUNT.worktreePath });

    const pending = screen.getAllByTestId('diff-mount-option');
    expect(pending.map((option) => option.getAttribute('data-stat'))).toEqual([
      'pending',
      'pending',
    ]);
    for (const option of pending) {
      expect(option.lastElementChild?.className).toContain('min-w-16');
      expect(option.textContent).not.toContain('+');
    }

    diffStats = new Map([
      [API_MOUNT.worktreePath, { additions: 0, deletions: 0 }],
      [WEB_MOUNT.worktreePath, { additions: 4, deletions: 2 }],
    ]);
    rerender(
      <FilesPane
        sessionId={SESSION_ID}
        sessionDir="/tmp/wt"
        worktreePath={API_MOUNT.worktreePath}
        isBranchless={false}
        onClose={() => undefined}
      />,
    );

    const resolved = screen.getAllByTestId('diff-mount-option');
    expect(resolved.map((option) => option.getAttribute('data-stat'))).toEqual([
      'quiet',
      'changed',
    ]);
    for (const option of resolved) {
      expect(option.lastElementChild?.className).toContain('min-w-16');
    }
  });

  it('opens the mount diff for the mount the user picks', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: API_MOUNT.worktreePath });
    fireEvent.click(screen.getByRole('button', { name: /web/ }));

    expect(openMountDiff).toHaveBeenCalledWith(SESSION_ID, WEB_MOUNT.worktreePath);
  });

  it('diffs the mount it was handed, not the first one mounted', () => {
    reset({ mounts: [API_MOUNT, WEB_MOUNT] });
    setActiveLens(set)(SESSION_ID, 'files');

    renderPane({ worktreePath: WEB_MOUNT.worktreePath });

    expect(screen.getByTestId('diff-viewer').getAttribute('data-worktree')).toBe(
      WEB_MOUNT.worktreePath,
    );
    expect(screen.getByRole('button', { name: /web/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /api/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the file versions pane with its own close control when branchless', () => {
    reset();
    setActiveLens(set)(SESSION_ID, 'files');

    renderBranchlessPane();

    expect(screen.getByTestId('file-versions')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
