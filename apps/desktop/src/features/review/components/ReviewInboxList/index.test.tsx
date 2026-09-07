// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  IsoDateTime,
  Project,
  ProjectId,
  ReviewablePr,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';

const h = vi.hoisted(() => ({
  refreshReviewPrs: vi.fn(async () => undefined),
  state: {
    reviewPrs: {} as Record<
      string,
      {
        items: ReadonlyArray<unknown>;
        loading: boolean;
        error: string | null;
        fetchedAt: string | null;
      }
    >,
    workspaces: [] as ReadonlyArray<Workspace>,
    projects: [] as ReadonlyArray<Project>,
  },
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(
    selector: (state: typeof h.state & { refreshReviewPrs: typeof h.refreshReviewPrs }) => T,
  ) => selector({ ...h.state, refreshReviewPrs: h.refreshReviewPrs }),
}));

vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  return {
    ...actual,
    ScrollFade: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import { ReviewInboxList } from './index';

const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const DATE = '2026-07-22T10:00:00Z' as IsoDateTime;

const pr = (overrides: Partial<ReviewablePr>): ReviewablePr => ({
  id: 'github:1',
  provider: 'github',
  repo: 'acme/web',
  number: 1,
  title: 'Fix login flow',
  url: 'https://github.com/acme/web/pull/1',
  author: 'sam',
  authorAvatarUrl: null,
  mine: false,
  reviewRequested: false,
  state: 'open',
  baseBranch: 'main',
  headBranch: 'sam/fix-login',
  isDraft: false,
  updatedAt: '2026-07-22T10:00:00Z',
  ...overrides,
});

const setItems = (
  items: ReadonlyArray<ReviewablePr>,
  loading = false,
  error: string | null = null,
) => {
  h.state.reviewPrs = {
    [WORKSPACE_ID]: { items, loading, error, fetchedAt: '2026-07-22T10:00:00Z' },
  };
};

const renderList = (scope: 'others' | 'all', onSelect = vi.fn()) => {
  render(
    <ReviewInboxList
      workspaceId={WORKSPACE_ID}
      provider="github"
      scope={scope}
      focusedPrId={null}
      onSelect={onSelect}
    />,
  );
  return onSelect;
};

beforeEach(() => {
  h.state.reviewPrs = {};
  h.state.workspaces = [
    {
      id: WORKSPACE_ID,
      name: 'Web',
      slug: 'web',
      sessionsRoot: '/tmp/web',
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
      createdAt: DATE,
      updatedAt: DATE,
    },
  ];
  h.state.projects = [
    {
      id: 'project-web' as ProjectId,
      workspaceId: WORKSPACE_ID,
      name: 'web',
      rootPath: '/tmp/web',
      kind: 'repo',
      overrides: h.state.workspaces[0]!.overrides,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ];
  h.refreshReviewPrs.mockClear();
});

afterEach(cleanup);

describe('ReviewInboxList', () => {
  it('refreshes on mount and filters out own PRs in the others scope', () => {
    setItems([
      pr({ id: 'github:1', number: 1, title: 'Mine only', mine: true }),
      pr({ id: 'github:2', number: 2, title: 'Teammate work' }),
    ]);
    renderList('others');

    expect(h.refreshReviewPrs).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(screen.getByText('Teammate work')).toBeDefined();
    expect(screen.queryByText('Mine only')).toBeNull();
  });

  it('shows own PRs with a Mine chip in the all scope and selects rows', () => {
    setItems([
      pr({ id: 'github:1', number: 1, title: 'Mine only', mine: true }),
      pr({ id: 'github:2', number: 2, title: 'Teammate work' }),
    ]);
    const onSelect = renderList('all');

    expect(screen.getByText('Mine only')).toBeDefined();
    expect(screen.getByText('Mine')).toBeDefined();
    fireEvent.click(screen.getByText('Teammate work'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'github:2' }));
  });

  it('sorts review-requested PRs first and badges them', () => {
    setItems([
      pr({ id: 'github:1', number: 1, title: 'Newer plain', updatedAt: '2026-07-23T10:00:00Z' }),
      pr({
        id: 'github:2',
        number: 2,
        title: 'Older requested',
        reviewRequested: true,
        updatedAt: '2026-07-20T10:00:00Z',
      }),
    ]);
    renderList('others');

    const rows = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(rows[0]).toContain('Older requested');
    expect(rows[0]).toContain('Review requested');
    expect(rows[1]).toContain('Newer plain');
  });

  it('shows repository attribution only for a multi-project workspace', () => {
    const projectId = 'project-web' as ProjectId;
    h.state.workspaces = [
      {
        id: WORKSPACE_ID,
        name: 'Product',
        slug: 'product',
        sessionsRoot: '/tmp/product',
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
        createdAt: DATE,
        updatedAt: DATE,
      },
    ];
    setItems([pr({ projectId })]);
    h.state.projects = [
      h.state.projects[0]!,
      {
        ...h.state.projects[0]!,
        id: 'project-api' as ProjectId,
        name: 'api',
        rootPath: '/tmp/api',
      },
    ];

    const view = renderList('others');
    expect(screen.getByText('web')).toBeDefined();

    h.state.projects = [h.state.projects[0]!];
    cleanup();
    renderList('others', view);
    expect(screen.queryByText('web')).toBeNull();
  });

  it('shows the teammates empty state when nothing is reviewable', () => {
    setItems([pr({ id: 'github:1', mine: true })]);
    renderList('others');

    expect(screen.getByText('No open pull requests from teammates')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Refresh pull requests' })).toBeNull();
    h.refreshReviewPrs.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(h.refreshReviewPrs).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('shows loading skeletons before the first fetch resolves', () => {
    h.state.reviewPrs = {
      [WORKSPACE_ID]: { items: [], loading: true, error: null, fetchedAt: null },
    };
    renderList('others');

    expect(screen.getByRole('status', { name: 'Loading pull requests' })).toBeDefined();
  });

  it('surfaces errors with a retry action', () => {
    setItems([], false, 'gh: network unreachable');
    renderList('others');

    expect(screen.getByText('gh: network unreachable')).toBeDefined();
    h.refreshReviewPrs.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refreshReviewPrs).toHaveBeenCalledWith(WORKSPACE_ID);
  });
});
