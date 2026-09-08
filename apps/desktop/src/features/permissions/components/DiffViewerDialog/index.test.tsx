// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DiffView, SessionId } from '@goodboy/types';

type DiffViewSelectorMockProps = {
  view: DiffView;
  onChange: (view: DiffView) => void;
  filesCount: number | null;
};

type ToastAction = { readonly label: string; readonly onClick: () => void };

type ToastOptions = { readonly title?: string; readonly action?: ToastAction };

const { showToast, state, fixtures } = vi.hoisted(() => ({
  showToast: vi.fn<(kind: string, message: string, opts?: ToastOptions) => void>(),
  state: {
    settings: {} as Record<string, string>,
    sessionGithub: {} as Record<string, { pr: unknown } | undefined>,
    sessionResolveAttempts: {} as Record<string, ReadonlyArray<unknown>>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    sessionProjectMounts: {} as Record<string, ReadonlyArray<{ projectId: string }>>,
    projects: [] as ReadonlyArray<{ id: string; baseBranch?: string | null }>,
    sessions: [
      {
        id: 's1',
        workspaceId: 'workspace-1',
        providerPreference: { defaultProvider: 'anthropic' },
      },
    ],
    workspaceOverrides: {} as Record<string, { taskModels: Record<string, unknown> | null }>,
    providers: [{ id: 'anthropic', connection: 'connected' }],
    loadDiffComments: vi.fn(async () => undefined),
    addDiffComment: vi.fn(async () => undefined),
    resolveDiffComment: vi.fn(async () => undefined),
    consumeDiffComments: vi.fn(async () => undefined),
    reopenDiffComment: vi.fn(async () => undefined),
    deleteDiffComment: vi.fn(async () => undefined),
    selectAgent: vi.fn(async () => undefined),
    setActiveLens: vi.fn(),
    beginSessionCreation: vi.fn(() => 'creation-1'),
    endSessionCreation: vi.fn(),
    spawnAgent: vi.fn(async () => 'a1'),
    setAgentConfig: vi.fn(async () => undefined),
    sendTurn: vi.fn(async () => undefined),
    recordSessionEvent: vi.fn(async () => undefined),
  },
  fixtures: {
    files: [] as ReadonlyArray<unknown>,
    comments: [] as ReadonlyArray<unknown>,
    diffFailure: null as string | null,
    status: {
      head: null,
      headSubject: null,
      workingTree: {
        kind: 'known',
        staged: 0,
        unstaged: 0,
        untracked: 0,
        unmerged: 0,
        changed: 0,
      },
      upstream: null as string | null,
      inProgress: null,
      branch: null,
      upstreamDistance: { kind: 'known', ahead: 0, behind: 0 },
      mainDistance: { kind: 'known', ahead: 2, behind: 3 },
    },
  },
}));

const scrollIntoViewMock = vi.fn();

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (s: typeof state) => T) => selector(state),
  useDiffComments: () => fixtures.comments,
  useSummarizerStatus: () => ({ status: 'idle' }),
}));

vi.mock('../../../../features/github/github', () => ({
  ghPrDiff: vi.fn(async () => ''),
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../../../../features/worktree/worktree', () => ({
  listBranchCommits: vi.fn(async () => []),
  worktreeDiff: vi.fn(async () => {
    if (fixtures.diffFailure !== null) {
      throw new Error(fixtures.diffFailure);
    }
    return '';
  }),
  worktreeDiffCommit: vi.fn(async () => ''),
  worktreeDiffWorking: vi.fn(async () => ''),
  worktreeStatus: vi.fn(async () => fixtures.status),
}));

vi.mock('../DiffViewSelector', () => ({
  DiffViewSelector: ({ view, onChange, filesCount }: DiffViewSelectorMockProps) => (
    <>
      <button type="button" onClick={() => onChange({ kind: 'working', scope: 'staged' })}>
        {view.kind === 'branch' ? 'branch vs main' : 'staged only'}
      </button>
      <span data-testid="selector-count">
        {filesCount === null ? 'no count' : `${filesCount} counted`}
      </span>
    </>
  ),
}));

vi.mock('@goodboy/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@goodboy/core')>()),
  parseUnifiedDiff: () => fixtures.files,
}));

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
  scrollIntoViewMock.mockReset();
  state.settings = {};
  state.sessionPhaseRuns = {};
  state.workspaceOverrides = {};
  state.loadDiffComments = vi.fn(async () => undefined);
  state.addDiffComment = vi.fn(async () => undefined);
  state.selectAgent.mockClear();
  state.setActiveLens.mockClear();
  state.spawnAgent.mockClear();
  state.recordSessionEvent.mockClear();
  showToast.mockClear();
  fixtures.files = [];
  fixtures.comments = [];
  fixtures.diffFailure = null;
  fixtures.status.upstream = null;
  fixtures.status.branch = null;
  fixtures.status.upstreamDistance = { kind: 'known', ahead: 0, behind: 0 };
  fixtures.status.mainDistance = { kind: 'known', ahead: 2, behind: 3 };
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

import { DiffViewerDialog, DiffViewerPane } from './index';
import { DIFF_CAPPED_COLUMN_CLASS } from './lib';

const SID = 's1' as SessionId;

const fileFixture = () => [
  {
    path: 'src/a.ts',
    status: 'modified',
    additions: 3,
    deletions: 0,
    binary: false,
    hunks: [
      {
        header: '@@ -1,0 +1,3 @@',
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 3,
        lines: [
          { kind: 'add', oldLine: null, newLine: 1, text: 'alpha' },
          { kind: 'add', oldLine: null, newLine: 2, text: 'beta' },
          { kind: 'add', oldLine: null, newLine: 3, text: 'gamma' },
        ],
      },
    ],
  },
];

describe('DiffViewerDialog', () => {
  it('renders an empty-state with the no-source error when no loader is configured', async () => {
    render(<DiffViewerDialog open onClose={vi.fn()} />);
    expect(await screen.findByText(/no diff source configured/i)).toBeDefined();
  });

  it('renders close button when open', () => {
    render(<DiffViewerDialog open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^close$/i })).toBeDefined();
  });

  it('renders a load failure as an alert strip with a retry action', async () => {
    const loader = vi.fn(async () => {
      throw new Error('boom');
    });
    render(<DiffViewerDialog open loader={loader} onClose={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('boom');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
  });

  it('refetches the diff when the retry action is clicked', async () => {
    let attempt = 0;
    const loader = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('boom');
      }
      return '';
    });
    fixtures.files = fileFixture();
    render(<DiffViewerDialog open loader={loader} onClose={vi.fn()} />);

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('alpha')).toBeDefined();
  });
});

describe('DiffViewerPane', () => {
  it('mounts content without an open gate and surfaces the no-source error', async () => {
    render(<DiffViewerPane onClose={vi.fn()} />);
    expect(await screen.findByText(/no diff source configured/i)).toBeDefined();
  });

  it('renders the canonical pane header without studio chrome', () => {
    const { container } = render(<DiffViewerPane onClose={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: /^diff$/i });
    expect(heading.className).toContain('text-xl');
    expect(heading.className).toContain('font-semibold');
    expect(screen.getByText("Changes across this session's working tree.")).toBeDefined();
    expect(screen.queryByText('acme')).toBeNull();
    expect(screen.queryByText('beta')).toBeNull();
    expect(container.firstElementChild?.className).toContain('motion-safe:animate-studio-in');
  });

  it('renders the session eyebrow above the pane title', () => {
    render(<DiffViewerPane onClose={vi.fn()} eyebrow={<span>Ship the lens eyebrow</span>} />);

    const eyebrow = screen.getByText('Ship the lens eyebrow');
    const heading = screen.getByRole('heading', { name: /^diff$/i });
    expect(
      eyebrow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('lets the pane content span the full lens width', () => {
    const { container } = render(<DiffViewerPane onClose={vi.fn()} />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('w-full');
    expect(shell.className).not.toContain('mx-auto');
    expect(shell.className).not.toContain('max-w-');
    expect(shell.className).not.toContain('fixed');
  });

  it('shows a compact refresh action for an empty default pane view', async () => {
    const { container } = render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);
    expect(await screen.findByText('Branch matches main')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'branch vs main' })).toBeNull();
    expect(screen.queryByRole('button', { name: /file list/i })).toBeNull();
    const refresh = screen.getByRole('button', { name: 'Refresh git state' });
    expect(refresh).toBeDefined();
    expect(refresh.parentElement?.className).toContain('gap-1.5');
    expect(refresh.parentElement?.className).toContain('pt-0.5');
    expect(container.querySelector('[class*="max-w-2xl"]')).toBeNull();
    expect(container.querySelector('[class*="max-w-5xl"]')).not.toBeNull();
  });

  it('caps the pane header to the empty-state column when there is nothing to diff', async () => {
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);
    await screen.findByText('Branch matches main');
    const header = screen.getByTestId('diff-pane-header');
    for (const cls of DIFF_CAPPED_COLUMN_CLASS.split(' ')) {
      expect(header.className).toContain(cls);
    }
  });

  it('lets the pane header span the full width once files load', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    const header = screen.getByTestId('diff-pane-header');
    expect(header.className).not.toContain('max-w-5xl');
    expect(header.className).not.toContain('mx-auto');
  });

  it('reports content emptiness to the pane host as the diff loads', async () => {
    const onContentEmptyChange = vi.fn();
    fixtures.files = fileFixture();
    render(
      <DiffViewerPane
        worktreePath="/tmp/worktree"
        onContentEmptyChange={onContentEmptyChange}
        onClose={vi.fn()}
      />,
    );
    await screen.findByText(/alpha/);
    expect(onContentEmptyChange).toHaveBeenCalledWith(true);
    expect(onContentEmptyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the selector available when a non-default pane view becomes empty', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    fixtures.files = [];
    fireEvent.click(screen.getByRole('button', { name: 'branch vs main' }));
    expect(await screen.findByText('No staged changes')).toBeDefined();
    expect(screen.getByRole('button', { name: 'staged only' })).toBeDefined();
  });

  it('shows selector controls and main-relative commit metadata for a non-empty diff', async () => {
    fixtures.files = fileFixture();
    fixtures.status.upstream = 'origin/feature';
    Object.assign(fixtures.status, { branch: 'feature' });
    fixtures.status.upstreamDistance = { kind: 'known', ahead: 2, behind: 1 };
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);
    expect(await screen.findByText(/alpha/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'branch vs main' })).toBeDefined();
    expect(await screen.findByText('2 commits')).toBeDefined();
    expect(screen.getByText('behind main by 3')).toBeDefined();
    expect(screen.getByTitle('Commits on main not in this branch')).toBeDefined();
    expect(screen.getByTitle('Unpushed commits')).toBeDefined();
    expect(screen.getByTitle('Behind upstream')).toBeDefined();
    expect(screen.queryByText('1 file')).toBeNull();
  });

  it('stops asserting a file count once the diff failed to load', async () => {
    fixtures.diffFailure = 'repository not found';
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('repository not found');
    for (const counter of screen.getAllByTestId('selector-count')) {
      expect(counter.textContent).toBe('no count');
    }
  });

  it('reports the file count once the diff actually loaded', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    await screen.findByText(/alpha/);
    expect(screen.getAllByTestId('selector-count')[0]?.textContent).toBe('1 counted');
  });

  it('keeps the diff on screen when the rebase starts and opens the agent only on request', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rebase' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledOnce());
    expect(showToast.mock.calls[0]?.[2]?.title).toBe('Rebase started');
    expect(state.selectAgent).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Rebase' })).toBeDefined();
    expect(state.recordSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'rebase_requested' }),
    );
  });

  it('spawns a rebase agent with the resolved task model when behind main', async () => {
    fixtures.files = fileFixture();
    state.workspaceOverrides = {
      'workspace-1': {
        taskModels: {
          rebase: { providerId: 'codex', model: 'gpt-5.4' },
        },
      },
    };
    render(<DiffViewerPane sessionId={SID} worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rebase' }));

    await waitFor(() => expect(state.spawnAgent).toHaveBeenCalledOnce());
    expect(state.spawnAgent).toHaveBeenCalledWith(
      SID,
      expect.objectContaining({
        name: 'Rebase on main',
        provider: 'codex',
        model: 'gpt-5.4',
        effort: 'low',
        focus: 'none',
      }),
    );
    expect(state.selectAgent).not.toHaveBeenCalled();
  });

  it('surfaces rebase agent failures beside the action', async () => {
    fixtures.files = fileFixture();
    state.spawnAgent.mockRejectedValueOnce(new Error('agent launch failed'));
    render(<DiffViewerPane sessionId={SID} worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rebase' }));

    expect((await screen.findByRole('alert')).textContent).toContain('agent launch failed');
  });

  it('does not show the rebase action when the branch is not behind main', async () => {
    fixtures.files = fileFixture();
    fixtures.status.mainDistance = { kind: 'known', ahead: 2, behind: 0 };
    render(<DiffViewerPane sessionId={SID} worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    expect(await screen.findByText('2 commits')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Rebase' })).toBeNull();
  });

  it('disables rebase while the session rebase agent is running', async () => {
    fixtures.files = fileFixture();
    state.sessionPhaseRuns = {
      [SID]: [{ name: 'Rebase on main', status: 'running' }],
    };
    render(<DiffViewerPane sessionId={SID} worktreePath="/tmp/worktree" onClose={vi.fn()} />);

    const button = await screen.findByRole('button', { name: 'Rebase' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('title')).toBe('Rebase agent is still running');
  });

  it('loads the commit a diff focus names and scrolls to its file', async () => {
    fixtures.files = fileFixture();
    const { worktreeDiffCommit } = await import('../../../../features/worktree/worktree');
    render(
      <DiffViewerPane
        sessionId={SID}
        worktreePath="/tmp/worktree"
        diffFocus={{ kind: 'commit', sha: 'abc1234def', path: 'src/a.ts' }}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(worktreeDiffCommit).toHaveBeenCalledWith('/tmp/worktree', 'abc1234def'),
    );
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it('loads every uncommitted change when the diff focus names the working tree', async () => {
    fixtures.files = fileFixture();
    const { worktreeDiffWorking } = await import('../../../../features/worktree/worktree');
    render(
      <DiffViewerPane
        sessionId={SID}
        worktreePath="/tmp/worktree"
        diffFocus={{ kind: 'working', path: null }}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(worktreeDiffWorking).toHaveBeenCalledWith('/tmp/worktree', 'all'));
  });

  it('lands on the branch vs main view when no diff focus is set', async () => {
    fixtures.files = fileFixture();
    const { worktreeDiff, worktreeDiffWorking } =
      await import('../../../../features/worktree/worktree');
    vi.mocked(worktreeDiff).mockClear();
    vi.mocked(worktreeDiffWorking).mockClear();
    render(
      <DiffViewerPane
        sessionId={SID}
        worktreePath="/tmp/worktree"
        diffFocus={null}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(worktreeDiff).toHaveBeenCalledWith({ worktreePath: '/tmp/worktree' }),
    );
    expect(worktreeDiffWorking).not.toHaveBeenCalled();
  });
});

describe('line comment add (single + multi-line drag)', () => {
  it('single click on a line number opens a single-line composer', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    fireEvent.pointerDown(screen.getByLabelText('comment on new line 1'));
    fireEvent.pointerUp(window);
    const composerLabel = await screen.findByText('commenting on line 1');
    const scrollContent = composerLabel.closest('[data-diff-scroll-content]');
    expect(scrollContent?.className).toContain('sticky');
    expect(scrollContent?.className).toContain('left-0');
    expect(scrollContent?.className).toContain('w-[var(--diff-card-width)]');
  });

  it('dragging a line number across rows opens a range composer and persists endLineNumber', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    fireEvent.pointerDown(screen.getByLabelText('comment on new line 1'));
    const lastRow = screen.getByText(/gamma/).closest('tr');
    expect(lastRow).not.toBeNull();
    fireEvent.mouseEnter(lastRow as HTMLElement);
    fireEvent.pointerUp(window);
    expect(await screen.findByText('commenting on lines 1–3')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText(/note for the agent/i), {
      target: { value: 'range note' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(state.addDiffComment).toHaveBeenCalledWith(SID, 'src/a.ts', 'range note', {
      side: 'new',
      lineNumber: 1,
      endLineNumber: 3,
    });
  });

  it('renders a range badge for an existing multi-line comment', async () => {
    fixtures.files = fileFixture();
    fixtures.comments = [
      {
        id: 'c1',
        sessionId: SID,
        filePath: 'src/a.ts',
        body: 'spans a range',
        status: 'open',
        createdAt: '2026-06-13T00:00:00.000Z',
        anchor: { side: 'new', lineNumber: 2, endLineNumber: 3 },
      },
    ];
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    expect(await screen.findByText('lines 2–3')).toBeDefined();
    expect(screen.getByText('spans a range')).toBeDefined();
  });

  it('labels old and new line cells with the numbers they display', async () => {
    fixtures.files = [
      {
        path: 'src/context.ts',
        status: 'modified',
        additions: 0,
        deletions: 0,
        binary: false,
        hunks: [
          {
            header: '@@ -10,1 +20,1 @@',
            oldStart: 10,
            oldLines: 1,
            newStart: 20,
            newLines: 1,
            lines: [{ kind: 'context', oldLine: 10, newLine: 20, text: 'shared' }],
          },
        ],
      },
    ];
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'comment on old line 10' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'comment on new line 20' })).toBeDefined();
    expect(screen.queryByLabelText('comment on old line 20')).toBeNull();
  });

  it('opens a single-line composer from a line cell with Enter', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    const lineCell = await screen.findByRole('button', { name: 'comment on new line 1' });

    fireEvent.keyDown(lineCell, { key: 'Enter' });

    expect(await screen.findByText('commenting on line 1')).toBeDefined();
  });

  it('keeps colSpan controls sticky within the wide diff table', async () => {
    const lines = Array.from({ length: 1001 }, (_, index) => ({
      kind: 'add',
      oldLine: null,
      newLine: index + 1,
      text: `line-${index + 1}`,
    }));
    fixtures.files = [
      {
        path: 'src/large.ts',
        status: 'modified',
        additions: lines.length,
        deletions: 0,
        binary: false,
        hunks: [
          {
            header: '@@ -1,0 +1,1001 @@',
            oldStart: 1,
            oldLines: 0,
            newStart: 1,
            newLines: lines.length,
            lines,
          },
        ],
      },
    ];
    fixtures.comments = [
      {
        id: 'c1',
        sessionId: SID,
        filePath: 'src/large.ts',
        body: 'sticky note',
        status: 'open',
        createdAt: '2026-06-13T00:00:00.000Z',
        anchor: { side: 'new', lineNumber: 2 },
      },
    ];
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    const showMoreButton = await screen.findByRole('button', { name: /show 1 more lines/i });
    fireEvent.pointerDown(screen.getByLabelText('comment on new line 1'));
    fireEvent.pointerUp(window);

    const scrollContents = [
      screen.getByText('sticky note').closest('[data-diff-scroll-content]'),
      (await screen.findByText('commenting on line 1')).closest('[data-diff-scroll-content]'),
      showMoreButton.closest('[data-diff-scroll-content]'),
    ];

    for (const scrollContent of scrollContents) {
      expect(scrollContent?.className).toContain('sticky');
      expect(scrollContent?.className).toContain('left-0');
      expect(scrollContent?.className).toContain('w-[var(--diff-card-width)]');
      expect(scrollContent?.parentElement?.tagName).toBe('TD');
      expect(scrollContent?.parentElement?.getAttribute('colspan')).toBe('3');
    }
  });

  it('opens file notes from the header action without a body call to action', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);

    const addFileNote = await screen.findByRole('button', { name: 'Add file note' });
    expect(screen.queryByText('Add file note')).toBeNull();
    fireEvent.click(addFileNote);
    expect(await screen.findByPlaceholderText(/note for the agent/i)).toBeDefined();
  });

  it('offers a routing picker for the resolver spawned from open notes', async () => {
    fixtures.files = fileFixture();
    fixtures.comments = [
      {
        id: 'c1',
        sessionId: SID,
        filePath: 'src/a.ts',
        body: 'please fix',
        status: 'open',
        createdAt: '2026-06-13T00:00:00.000Z',
        anchor: { side: 'new', lineNumber: 2 },
      },
    ];
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    const picker = await screen.findByRole('button', { name: /^Resolver routing:/ });
    expect(picker.getAttribute('aria-label')).toContain('Claude');
    expect(picker.textContent).toContain('Medium');
  });
});

describe('diff layout toggle', () => {
  it('renders unified rows until the split layout is chosen', async () => {
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);

    const firstLine = await screen.findByText('alpha');
    expect(firstLine.closest('tr')?.querySelectorAll('td')).toHaveLength(3);

    fireEvent.click(screen.getByRole('tab', { name: 'Split' }));

    expect(screen.getByText('alpha').closest('tr')?.querySelectorAll('td')).toHaveLength(4);
    expect(localStorage.getItem('goodboy:diff-layout-mode')).toBe('split');
  });

  it('rehydrates the split layout from the stored preference', async () => {
    localStorage.setItem('goodboy:diff-layout-mode', 'split');
    fixtures.files = fileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);

    const firstLine = await screen.findByText('alpha');
    expect(firstLine.closest('tr')?.querySelectorAll('td')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Split' }).getAttribute('aria-selected')).toBe('true');
  });
});

const twoFileFixture = () => [
  {
    path: 'src/a.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    hunks: [
      {
        header: '@@ -1,0 +1,1 @@',
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'add', oldLine: null, newLine: 1, text: 'alpha' }],
      },
    ],
  },
  {
    path: 'src/b.ts',
    status: 'added',
    additions: 1,
    deletions: 0,
    binary: false,
    hunks: [
      {
        header: '@@ -0,0 +1,1 @@',
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'add', oldLine: null, newLine: 1, text: 'bravo' }],
      },
    ],
  },
];

describe('single-scroll all-files layout', () => {
  it('renders every file in one scroll, not one at a time', async () => {
    fixtures.files = twoFileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    expect(screen.getByText(/bravo/)).toBeDefined();
    expect(screen.getAllByText('src/a.ts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('src/b.ts').length).toBeGreaterThan(0);
  });

  it('gives each file table its own horizontal scrollbar without wrapping code', async () => {
    fixtures.files = fileFixture();
    const { container } = render(
      <DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />,
    );
    await screen.findByText(/alpha/);
    const table = container.querySelector('table');
    const codeCell = screen.getByText(/alpha/).closest('td');
    expect(table?.parentElement?.className).toContain('overflow-x-auto');
    expect(table?.className).toContain('w-max');
    expect(codeCell?.className).toContain('whitespace-pre');
  });
});

describe('per-file reviewed state', () => {
  it('marking a file viewed collapses it, updates progress, and persists', async () => {
    fixtures.files = twoFileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    const viewedButtons = screen.getAllByRole('button', { name: /viewed/i });
    fireEvent.click(viewedButtons[0]!);
    expect(await screen.findByText(/1\/2 reviewed/)).toBeDefined();
    expect(screen.queryByText(/alpha/)).toBeNull();
    expect(localStorage.getItem(`goodboy:diff-reviewed:${SID}:branch`)).not.toBeNull();
  });

  it('shows "previously reviewed" when a reviewed file changed since', async () => {
    localStorage.setItem(
      `goodboy:diff-reviewed:${SID}:branch`,
      JSON.stringify({ 'src/a.ts': 'stale-signature' }),
    );
    fixtures.files = twoFileFixture();
    render(<DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />);
    await screen.findByText(/alpha/);
    expect(screen.getByText(/previously reviewed/i)).toBeDefined();
  });
});

const flushMicrotasks = () => act(async () => {});

const makeFiles = (count: number, prefix = 'file') =>
  Array.from({ length: count }, (_, i) => ({
    path: `src/${prefix}${i}.ts`,
    status: 'modified',
    additions: 1,
    deletions: 0,
    binary: false,
    hunks: [
      {
        header: '@@ -1,0 +1,1 @@',
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: 'add', oldLine: null, newLine: 1, text: `${prefix}${i}` }],
      },
    ],
  }));

type EmitIntersectionParams = {
  entries: ReadonlyArray<{
    target: Element;
    top: number;
  }>;
};

type IdleCallbackState = {
  current: IdleRequestCallback | null;
};

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = [];

  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    TestIntersectionObserver.instances.push(this);
  }

  disconnect(): void {
    this.targets.clear();
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  emit({ entries }: EmitIntersectionParams): void {
    const records = entries.map(({ target, top }) => {
      const rect = new DOMRect(0, top, 100, 100);
      return {
        boundingClientRect: rect,
        intersectionRatio: 1,
        intersectionRect: rect,
        isIntersecting: true,
        rootBounds: null,
        target,
        time: 0,
      } satisfies IntersectionObserverEntry;
    });
    this.callback(records, this);
  }
}

describe('progressive batching', () => {
  it('mounts and scrolls to a file beyond the first batch when its rail entry is clicked', async () => {
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    localStorage.setItem('goodboy:diff-sidebar-collapsed', '0');
    fixtures.files = makeFiles(25);
    const { container } = render(
      <DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />,
    );

    await screen.findByTitle('src/file22.ts');
    expect(container.querySelector('[data-file-path="src/file22.ts"]')).toBeNull();
    fireEvent.click(screen.getByTitle('src/file22.ts'));

    await waitFor(() => {
      const fileCard = container.querySelector('[data-file-path="src/file22.ts"]');
      expect(fileCard).not.toBeNull();
      expect(scrollIntoViewMock.mock.contexts).toContain(fileCard);
    });
  });

  it('mounts only the first batch initially and appends more after idle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fixtures.files = makeFiles(25);
    const { container } = render(
      <DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />,
    );

    await flushMicrotasks();

    const countAfterFirst = container.querySelectorAll('[data-file-path]').length;
    expect(countAfterFirst).toBeLessThanOrEqual(20);
    expect(countAfterFirst).toBeGreaterThan(0);

    await act(async () => {
      vi.runAllTimers();
    });

    expect(container.querySelectorAll('[data-file-path]').length).toBe(25);

    vi.useRealTimers();
  });

  it('keeps the active file stable while idle batches mount', async () => {
    TestIntersectionObserver.instances = [];
    const idleCallbackState: IdleCallbackState = { current: null };
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idleCallbackState.current = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    localStorage.setItem('goodboy:diff-sidebar-collapsed', '0');
    fixtures.files = makeFiles(25);
    const { container } = render(
      <DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />,
    );
    await screen.findByTitle('src/file22.ts');
    const firstCard = container.querySelector('[data-file-path="src/file0.ts"]');
    const secondCard = container.querySelector('[data-file-path="src/file1.ts"]');
    if (
      firstCard === null ||
      secondCard === null ||
      TestIntersectionObserver.instances[0] === undefined
    ) {
      throw new Error('expected initial diff cards and observer');
    }

    act(() => {
      TestIntersectionObserver.instances[0]?.emit({
        entries: [
          { target: firstCard, top: 0 },
          { target: secondCard, top: 100 },
        ],
      });
    });
    const activeRailEntry = screen
      .getAllByTitle('src/file0.ts')
      .find((element) => element.parentElement?.className.includes('group relative') === true);
    expect(activeRailEntry?.parentElement?.className).toContain('border-primary');

    const scheduledIdleCallback = idleCallbackState.current;
    if (scheduledIdleCallback === null) {
      throw new Error('expected an idle batch callback');
    }
    await act(async () => {
      scheduledIdleCallback({
        didTimeout: false,
        timeRemaining: () => 50,
      });
    });

    expect(TestIntersectionObserver.instances).toHaveLength(1);
    expect(activeRailEntry?.parentElement?.className).toContain('border-primary');
  });

  it('resets batch count when the diff source changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fixtures.files = makeFiles(25, 'a');
    const { container, rerender } = render(
      <DiffViewerPane sessionId={SID} loader={async () => 'raw'} onClose={vi.fn()} />,
    );

    await flushMicrotasks();
    await act(async () => {
      vi.runAllTimers();
    });
    expect(container.querySelectorAll('[data-file-path]').length).toBe(25);

    fixtures.files = makeFiles(25, 'b');
    rerender(<DiffViewerPane sessionId={SID} loader={async () => 'raw2'} onClose={vi.fn()} />);
    await flushMicrotasks();

    const countAfterReset = container.querySelectorAll('[data-file-path]').length;
    expect(countAfterReset).toBeLessThanOrEqual(20);
    expect(countAfterReset).toBeGreaterThan(0);

    await act(async () => {
      vi.runAllTimers();
    });
    expect(container.querySelectorAll('[data-file-path]').length).toBe(25);

    vi.useRealTimers();
  });
});

describe('DiffViewerDialog vs DiffViewerPane structural difference', () => {
  it('DiffViewerDialog uses a fixed overlay and DiffViewerPane fills its lens slot', () => {
    const { container: dialogContainer } = render(<DiffViewerDialog open onClose={vi.fn()} />);
    const { container: paneContainer } = render(<DiffViewerPane onClose={vi.fn()} />);
    const dialogRoot = dialogContainer.querySelector('dialog, [role="dialog"]');
    expect(dialogRoot).not.toBeNull();

    const paneShell = paneContainer.firstElementChild as HTMLElement;
    expect(paneShell.className).toContain('w-full');
    expect(paneShell.className).not.toContain('max-w-');
    expect(paneShell.className).not.toContain('fixed');
  });
});
