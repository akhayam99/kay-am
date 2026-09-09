// @vitest-environment happy-dom

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  IsoDateTime,
  PullRequestState,
  SessionExternalTask,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';

type FocusedExternalTask = {
  readonly provider: string;
  readonly externalId: string;
  readonly projectId: string | null;
};

type Store = {
  readonly sessionExternalTasks: Readonly<Record<string, ReadonlyArray<SessionExternalTask>>>;
  readonly focusedExternalTask: Readonly<Record<string, FocusedExternalTask | null>>;
  readonly sessionProjectPrs: Readonly<
    Record<string, Readonly<Record<string, ReadonlyArray<PullRequestState>>>>
  >;
  readonly projects: ReadonlyArray<{ id: string; kind: string }>;
  readonly sessionProjectMounts: Readonly<
    Record<
      string,
      ReadonlyArray<{
        projectId: string;
        mountName: string | null;
        worktreePath: string;
        repoRoot: string;
        branch: string;
      }>
    >
  >;
  readonly sessionActiveProject: Readonly<Record<string, string>>;
  readonly sessionGitlabMr: Readonly<Record<string, unknown>>;
  readonly workspaceIntegrations: Readonly<Record<string, ReadonlyArray<{ provider: string }>>>;
  readonly sessions: ReadonlyArray<{ id: string; workspaceId: string }>;
  readonly linkSessionExternalTask: ReturnType<typeof vi.fn>;
  readonly unlinkSessionExternalTask: ReturnType<typeof vi.fn>;
  readonly integrationCredentials: ReadonlyArray<unknown>;
  readonly integrationCredentialUsage: Readonly<Record<string, number>>;
  readonly forgetIntegrationCredential: ReturnType<typeof vi.fn>;
  readonly disconnectIntegration: ReturnType<typeof vi.fn>;
  readonly connectLinear: ReturnType<typeof vi.fn>;
};

type Props = {
  readonly title: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
};

type TaskDetailProps = {
  readonly task: SessionExternalTask;
};

const h = vi.hoisted(() => ({
  store: {
    sessionExternalTasks: {},
    focusedExternalTask: {},
    sessionProjectPrs: {},
    projects: [] as ReadonlyArray<{ id: string; kind: string }>,
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionGitlabMr: {},
    workspaceIntegrations: {},
    sessions: [] as ReadonlyArray<{ id: string; workspaceId: string }>,
    linkSessionExternalTask: vi.fn(async () => undefined),
    unlinkSessionExternalTask: vi.fn(async () => undefined),
    integrationCredentials: [],
    integrationCredentialUsage: {},
    forgetIntegrationCredential: vi.fn(async () => undefined),
    disconnectIntegration: vi.fn(async () => undefined),
    connectLinear: vi.fn(async () => undefined),
  },
  openUrl: vi.fn(async () => undefined),
  loadCandidates: vi.fn(),
  candidate: {
    provider: 'linear',
    externalId: 'GB-77',
    identifier: 'GB-77',
    title: 'Ship the issue picker',
    url: 'https://linear.app/goodboy/issue/GB-77/ship-the-issue-picker',
    goal: 'Ship the issue picker',
    branchSlug: 'ship-the-issue-picker',
  },
}));

vi.mock('../../../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(selector: (state: Store) => T) => selector(h.store),
}));

vi.mock('../../../../../../shared/lib/editor', () => ({
  openUrl: h.openUrl,
}));

vi.mock('../../../../../worktree/useRemoteHostKind', () => ({
  useRemoteHostKind: () => 'github',
}));

vi.mock('./LinearTaskDetail', () => ({
  LinearTaskDetail: ({ task }: TaskDetailProps) => (
    <div data-testid="task-detail">
      <a href="https://linear.app/GB-42" aria-label="Open in Linear">
        Linear detail {task.externalId}
      </a>
      <button type="button" aria-label="Copy issue link" />
    </div>
  ),
}));

vi.mock('./GitlabTaskDetail', () => ({
  GitlabTaskDetail: ({ task }: TaskDetailProps) => (
    <div data-testid="task-detail">
      <a href="https://gitlab.com/acme/web/-/issues/3" aria-label="Open in GitLab">
        GitLab detail {task.externalId}
      </a>
      <button type="button" aria-label="Copy issue link" />
    </div>
  ),
}));

vi.mock('../../../../../../shared/components/PaneShell', () => ({
  PaneShell: ({ title, children, actions }: Props) => (
    <div>
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock('../../../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    repoRoot: '/tmp/goodboy',
    worktreePath: '/tmp/goodboy/.goodboy/worktrees/current',
    branch: 'ak/current',
    mountName: null,
    workspaceId: 'workspace-1',
  }),
}));

vi.mock('../../../../../integrations/hooks/useIssueCandidates', () => ({
  useIssueCandidates: () => ({
    rows: [h.candidate],
    isLoading: false,
    isLoaded: true,
    error: null,
    load: h.loadCandidates,
  }),
}));

import { IntegrationPane } from '.';
import { parseIntegrationTaskUrl } from './parseIntegrationTaskUrl';

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const CREATED_AT = '2026-07-22T12:00:00.000Z' as IsoDateTime;
const TASK: SessionExternalTask = {
  sessionId: SESSION_ID,
  provider: 'linear',
  externalId: 'GB-42',
  identifier: 'GB-42',
  title: 'Refactor integration storage',
  url: 'https://linear.app/goodboy/issue/GB-42/refactor-integration-storage',
  createdAt: CREATED_AT,
};
const SECOND_TASK: SessionExternalTask = {
  sessionId: SESSION_ID,
  provider: 'linear',
  externalId: 'GB-43',
  identifier: 'GB-43',
  title: 'Trim the integration pane',
  url: 'https://linear.app/goodboy/issue/GB-43/trim-the-integration-pane',
  createdAt: CREATED_AT,
};
const MERGED_PR: PullRequestState = {
  number: 42,
  title: 'Refactor integration storage',
  url: 'https://github.com/acme/goodboy/pull/42',
  state: 'merged',
  mergeable: null,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/current',
  isDraft: false,
  reviewDecision: 'approved',
  body: '',
  updatedAt: CREATED_AT,
};
const GITLAB_TASK: SessionExternalTask = {
  sessionId: SESSION_ID,
  provider: 'gitlab',
  externalId: 'acme/web#3',
  identifier: 'acme/web#3',
  title: 'Restore the pipeline',
  url: 'https://gitlab.com/acme/web/-/issues/3',
  createdAt: CREATED_AT,
};
beforeEach(() => {
  h.store.sessionExternalTasks = { [SESSION_ID]: [TASK] };
  h.store.focusedExternalTask = {};
  h.store.sessionProjectPrs = {};
  h.store.sessions = [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }];
  h.store.projects = [{ id: 'project-1', kind: 'repo' }];
  h.store.sessionProjectMounts = {
    [SESSION_ID]: [
      {
        projectId: 'project-1',
        mountName: null,
        worktreePath: '/wt',
        repoRoot: '/repo',
        branch: 'ak/current',
      },
    ],
  };
  h.store.sessionActiveProject = { [SESSION_ID]: 'project-1' };
  h.store.workspaceIntegrations = {
    [WORKSPACE_ID]: [{ provider: 'linear' }, { provider: 'sentry' }, { provider: 'gitlab' }],
  };
  h.store.linkSessionExternalTask.mockClear();
  h.store.unlinkSessionExternalTask.mockClear();
  h.store.connectLinear.mockClear();
  h.store.disconnectIntegration.mockClear();
  h.openUrl.mockClear();
});

afterEach(cleanup);

describe('parseIntegrationTaskUrl', () => {
  it('parses provider URLs and falls back to their trailing segment', () => {
    expect(
      parseIntegrationTaskUrl({
        provider: 'linear',
        rawUrl: 'linear.app/goodboy/issue/GB-42/refactor-integration-storage',
      }),
    ).toMatchObject({ externalId: 'GB-42', identifier: 'GB-42', title: 'GB-42' });
    expect(
      parseIntegrationTaskUrl({
        provider: 'sentry',
        rawUrl: 'https://sentry.io/organizations/goodboy/issues/12345/events/latest/',
      }),
    ).toMatchObject({ externalId: '12345', identifier: '12345' });
    expect(
      parseIntegrationTaskUrl({
        provider: 'gitlab',
        rawUrl: 'https://gitlab.com/acme/web/-/issues/7',
      }),
    ).toMatchObject({ externalId: 'acme/web#7', identifier: 'acme/web#7' });
    expect(
      parseIntegrationTaskUrl({
        provider: 'jira',
        rawUrl: 'https://acme.atlassian.net/browse/ENG-142',
      }),
    ).toMatchObject({ externalId: 'ENG-142', identifier: 'ENG-142', title: 'ENG-142' });
    expect(
      parseIntegrationTaskUrl({
        provider: 'linear',
        rawUrl: 'not a valid URL/item-9',
      }),
    ).toMatchObject({
      externalId: 'not a valid URL/item-9',
      identifier: 'item-9',
      url: 'not a valid URL/item-9',
    });
  });
});

describe('IntegrationPane', () => {
  it.each([['linear', TASK, 'Linear']] as const)(
    'shows one open and copy affordance for a linked %s task with detail',
    (provider, task, host) => {
      h.store.sessionExternalTasks = { [SESSION_ID]: [task] };

      render(
        <IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider={provider} />,
      );
      fireEvent.click(screen.getByRole('button', { name: `View ${task.identifier}` }));

      expect(screen.getAllByRole('link', { name: `Open in ${host}` })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Copy issue link' })).toHaveLength(1);
    },
  );

  it.each([
    ['linear', TASK, 'Linear detail GB-42'],
    ['gitlab', GITLAB_TASK, 'GitLab detail acme/web#3'],
  ] as const)(
    'opens the %s issue the session focused from another surface',
    (provider, task, detailText) => {
      h.store.sessionExternalTasks = { [SESSION_ID]: [task] };
      h.store.focusedExternalTask = {
        [SESSION_ID]: { provider, externalId: task.externalId, projectId: null },
      };

      render(
        <IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider={provider} />,
      );

      expect(screen.getByText(detailText)).toBeDefined();
      expect(screen.getByRole('button', { name: 'All issues' })).toBeDefined();
    },
  );

  it.each([
    ['linear', TASK, 'Linear detail GB-42'],
    ['gitlab', GITLAB_TASK, 'GitLab detail acme/web#3'],
  ] as const)(
    'lists the %s issues when the lens opens with nothing focused',
    (provider, task, detailText) => {
      h.store.sessionExternalTasks = { [SESSION_ID]: [task] };

      render(
        <IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider={provider} />,
      );

      expect(screen.getByRole('button', { name: `View ${task.identifier}` })).toBeDefined();
      expect(screen.queryByText(detailText)).toBeNull();
    },
  );

  it.each([0, 1, 2] as const)('states its section title with %i linked records', (count) => {
    h.store.sessionExternalTasks = { [SESSION_ID]: [TASK, SECOND_TASK].slice(0, count) };

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    expect(screen.getByRole('heading', { name: 'Linear' })).toBeDefined();
    expect(screen.queryAllByRole('button', { name: /^View GB-/ })).toHaveLength(count);
    expect(screen.queryByTestId('task-detail')).toBeNull();
  });

  it('states the section title above the focused record and holds its actions', () => {
    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);
    fireEvent.click(screen.getByRole('button', { name: 'View GB-42' }));

    const detail = screen.getByTestId('task-detail');

    expect(screen.getByRole('heading', { name: 'Linear' })).toBeDefined();
    expect(within(detail).queryByRole('button', { name: 'Unlink GB-42' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlink GB-42' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Link issue' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'All issues' })).toBeDefined();
  });

  it('lists every linked task as a card and focuses the clicked one', () => {
    h.store.sessionExternalTasks = { [SESSION_ID]: [TASK, SECOND_TASK] };

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    expect(screen.getAllByRole('button', { name: /^View GB-/ })).toHaveLength(2);
    expect(screen.getByText('Trim the integration pane')).toBeDefined();
    expect(screen.queryByText('Linear detail GB-42')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View GB-43' }));

    expect(screen.getByText('Linear detail GB-43')).toBeDefined();
    expect(screen.getByRole('button', { name: 'All issues' })).toBeDefined();
  });

  it('folds a merged work item behind a completed count until expanded', () => {
    h.store.sessionExternalTasks = {
      [SESSION_ID]: [
        { ...TASK, branch: 'ak/current' },
        { ...SECOND_TASK, branch: 'ak/shipped' },
      ],
    };
    h.store.sessionProjectPrs = { [SESSION_ID]: { 'project-1': [MERGED_PR] } };

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    const toggle = screen.getByRole('button', { name: 'Show completed (2)' });
    expect(screen.queryByText('ak/shipped')).toBeNull();

    fireEvent.click(toggle);

    expect(screen.getAllByText('Completed')).toHaveLength(1);
    expect(screen.getByText('ak/shipped')).toBeDefined();
  });

  it('renders no completed toggle when nothing is completed', () => {
    h.store.sessionExternalTasks = { [SESSION_ID]: [{ ...TASK, branch: 'ak/current' }] };

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    expect(screen.queryByRole('button', { name: /^Completed/ })).toBeNull();
  });

  it('opens and confirms before unlinking the focused task', async () => {
    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);
    fireEvent.click(screen.getByRole('button', { name: 'View GB-42' }));

    expect(screen.getByText('Linear detail GB-42')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink GB-42' }));
    expect(h.store.unlinkSessionExternalTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink GB-42' }));
    await waitFor(() =>
      expect(h.store.unlinkSessionExternalTask).toHaveBeenCalledWith(SESSION_ID, 'linear', 'GB-42'),
    );
  });

  it('links a pasted provider URL from the picker and closes the popover', async () => {
    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    fireEvent.click(screen.getByRole('button', { name: 'Link issue' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Link an issue' }), {
      target: { value: 'https://linear.app/goodboy/issue/GB-99/new-link' },
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Link GB-99' }));

    await waitFor(() => expect(h.store.linkSessionExternalTask).toHaveBeenCalledOnce());
    expect(h.store.linkSessionExternalTask).toHaveBeenCalledWith(SESSION_ID, {
      provider: 'linear',
      externalId: 'GB-99',
      identifier: 'GB-99',
      title: 'GB-99',
      url: 'https://linear.app/goodboy/issue/GB-99/new-link',
      createdAt: expect.any(String),
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'link Linear issue' })).toBeNull(),
    );
  });

  it('keeps the connected empty state to a single link affordance', () => {
    h.store.sessionExternalTasks = {};
    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="gitlab" />);

    expect(screen.getByText('No GitLab issues linked')).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Link an issue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open GitLab studio' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Link issue' }));

    expect(screen.getByRole('dialog', { name: 'Link GitLab issue' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Link an issue' })).toBeDefined();
  });

  it('shows the provider connection form inline when disconnected', async () => {
    h.store.sessionExternalTasks = {};
    h.store.workspaceIntegrations = {};
    const listener = vi.fn();
    window.addEventListener('goodboy:open-linear-studio', listener);

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    expect(screen.getByRole('heading', { name: 'Linear' })).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Link an issue' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Personal API key'), {
      target: { value: 'lin_api_test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(h.store.connectLinear).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        token: 'lin_api_test',
        credentialId: null,
      }),
    );
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('goodboy:open-linear-studio', listener);
  });

  it.each([['linear', TASK, 'Linear detail GB-42']] as const)(
    'keeps linked %s rows without rendering live detail while disconnected',
    (provider, task, detailText) => {
      h.store.sessionExternalTasks = { [SESSION_ID]: [task] };
      h.store.workspaceIntegrations = {};

      render(
        <IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider={provider} />,
      );

      expect(screen.getByText(task.title)).toBeDefined();
      expect(screen.queryByText(detailText)).toBeNull();
    },
  );

  it('links an issue picked from the assigned-issues search', async () => {
    h.store.workspaceIntegrations = { [WORKSPACE_ID]: [{ provider: 'linear' }] };

    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);

    fireEvent.click(screen.getByRole('button', { name: 'Link issue' }));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Link an issue' }));
    fireEvent.mouseDown(screen.getByText('Ship the issue picker'));

    await waitFor(() => expect(h.store.linkSessionExternalTask).toHaveBeenCalledOnce());
    expect(h.store.linkSessionExternalTask).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        provider: 'linear',
        externalId: 'GB-77',
        identifier: 'GB-77',
        title: 'Ship the issue picker',
        url: 'https://linear.app/goodboy/issue/GB-77/ship-the-issue-picker',
      }),
    );
  });

  it('links nothing when Enter is pressed in a closed issue picker', () => {
    render(<IntegrationPane sessionId={SESSION_ID} workspaceId={WORKSPACE_ID} provider="linear" />);
    fireEvent.click(screen.getByRole('button', { name: 'Link issue' }));
    const picker = screen.getByRole('combobox', { name: 'Link an issue' });

    fireEvent.focus(picker);
    fireEvent.keyDown(picker, { key: 'Escape' });
    fireEvent.keyDown(picker, { key: 'Enter' });

    expect(h.store.linkSessionExternalTask).not.toHaveBeenCalled();
  });
});
