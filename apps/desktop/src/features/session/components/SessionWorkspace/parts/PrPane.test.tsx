// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  GhTokenStatus,
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  PullRequestState,
  Session,
  SessionId,
  SessionProjectMount,
  WorkspaceId,
  Workspace,
} from '@goodboy/types';

type Store = {
  sessionGithub: Record<string, unknown>;
  sessionProjectPrs: Record<string, Readonly<Record<string, ReadonlyArray<PullRequestState>>>>;
  sessionSelectedPrNumber: Record<string, number | null>;
  sessionGitlabMr: Record<string, unknown>;
  sessionBitbucketPr: Record<string, unknown>;
  workspaceIntegrations: Record<string, ReadonlyArray<{ readonly provider: string }>>;
  readonly refreshSessionBitbucketPr: ReturnType<typeof vi.fn>;
  sessionProjectMounts: Record<string, ReadonlyArray<SessionProjectMount>>;
  sessionActiveProject: Record<string, ProjectId>;
  sessions: ReadonlyArray<Session>;
  workspaces: ReadonlyArray<Workspace>;
  projects: ReadonlyArray<Project>;
};

const h = vi.hoisted(() => ({
  store: {
    sessionGithub: {},
    sessionProjectPrs: {},
    sessionSelectedPrNumber: {},
    sessionGitlabMr: {},
    sessionBitbucketPr: {},
    workspaceIntegrations: {},
    refreshSessionBitbucketPr: vi.fn(async () => undefined),
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessions: [] as ReadonlyArray<Session>,
    workspaces: [] as ReadonlyArray<Workspace>,
    projects: [] as ReadonlyArray<Project>,
  } satisfies Store,
  remoteKind: 'github' as 'github' | 'gitlab' | 'other' | null,
  githubStatus: {
    available: true,
    mode: 'gh-cli',
    user: 'akhayam',
    scoped: false,
  } as GhTokenStatus,
  ghStatus: vi.fn(),
  ghSetToken: vi.fn(),
  openUrl: vi.fn(async () => undefined),
}));

const EMPTY_OVERRIDES: OverrideSettings = {
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
};

vi.mock('../../../../../store', () => ({
  EMPTY_ARRAY: [],
  useAppStore: <T,>(selector: (state: Store) => T) => selector(h.store),
}));

vi.mock('../../../../worktree/useRemoteHostKind', () => ({
  useRemoteHostKind: () => h.remoteKind,
}));

vi.mock('../../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    repoRoot: '/tmp/goodboy',
    worktreePath: '/tmp/goodboy/.goodboy/worktrees/refactor-auth',
    branch: 'ak/refactor-auth',
    mountName: null,
    workspaceId: 'workspace-1',
  }),
}));

vi.mock('../../../../context/components/ContextPanel/strips/GitlabMrStrip', () => ({
  GitlabMrStrip: ({ onOpenStudio }: { readonly onOpenStudio?: () => void }) => (
    <div>
      <div>GitLab merge request detail</div>
      <button type="button" onClick={onOpenStudio}>
        Open merge request from code host
      </button>
    </div>
  ),
}));

vi.mock('../../../../context/components/ContextPanel/strips/BitbucketPrStrip', () => ({
  BitbucketPrStrip: ({ onOpenStudio }: { readonly onOpenStudio?: () => void }) => (
    <div>
      <div>Bitbucket pull request detail</div>
      <button type="button" onClick={onOpenStudio}>
        Open pull request from code host
      </button>
    </div>
  ),
}));

vi.mock('../../../../github/github', () => ({
  ghStatus: h.ghStatus,
  ghSetToken: h.ghSetToken,
  ghClearToken: vi.fn(async () => undefined),
}));

vi.mock('../../../../../shared/lib/editor', () => ({
  openUrl: h.openUrl,
}));

import { PrPane } from './PrPane';

const DATE = '2026-07-22T10:00:00.000Z' as IsoDateTime;
const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-goodboy' as ProjectId;
const PULL_REQUEST = {
  number: 42,
  title: 'Refactor authentication',
  url: 'https://github.com/acme/goodboy/pull/42',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/refactor-auth',
  isDraft: false,
  reviewDecision: 'review_required',
  body: 'Refactors authentication.',
  updatedAt: DATE,
} satisfies PullRequestState;
const session: Session = {
  id: SESSION_ID,
  workspaceId: 'workspace-1' as WorkspaceId,
  goal: 'Refactor authentication',
  state: { kind: 'idle', lastActivityAt: DATE },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'bypassPermissions',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: DATE,
  updatedAt: DATE,
};

const withGithubPr = () => {
  h.store.sessionGithub = {
    [SESSION_ID]: {
      pr: PULL_REQUEST,
      detail: { checks: [], comments: [] },
      loading: false,
      error: null,
    },
  };
  h.store.sessionProjectPrs = { [SESSION_ID]: { [PROJECT_ID]: [PULL_REQUEST] } };
};

beforeEach(() => {
  h.store.sessionGithub = {};
  h.store.sessionProjectPrs = {};
  h.store.sessionSelectedPrNumber = {};
  h.store.sessionGitlabMr = {};
  h.store.sessionBitbucketPr = {};
  h.store.workspaceIntegrations = {};
  h.store.sessions = [session];
  h.store.workspaces = [
    {
      id: session.workspaceId,
      name: 'Goodboy',
      slug: 'goodboy',
      sessionsRoot: '/tmp/goodboy',
      overrides: EMPTY_OVERRIDES,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ];
  h.store.projects = [
    {
      id: PROJECT_ID,
      workspaceId: session.workspaceId,
      name: 'goodboy',
      rootPath: '/tmp/goodboy',
      kind: 'repo',
      overrides: EMPTY_OVERRIDES,
      createdAt: DATE,
      updatedAt: DATE,
    },
  ];
  h.store.sessionProjectMounts = {
    [SESSION_ID]: [
      {
        projectId: PROJECT_ID,
        mountName: 'goodboy',
        worktreePath: '/tmp/goodboy/.goodboy/worktrees/refactor-auth',
        repoRoot: '/tmp/goodboy',
        branch: 'ak/refactor-auth',
      } as SessionProjectMount,
    ],
  };
  h.store.sessionActiveProject = { [SESSION_ID]: PROJECT_ID };
  h.remoteKind = 'github';
  h.openUrl.mockClear();
  h.store.refreshSessionBitbucketPr.mockClear();
  h.githubStatus = {
    available: true,
    mode: 'gh-cli',
    user: 'akhayam',
    scoped: false,
  };
  h.ghStatus.mockImplementation(async () => h.githubStatus);
  h.ghSetToken.mockImplementation(async () => {
    h.githubStatus = {
      available: true,
      mode: 'pat',
      user: 'akhayam',
      scoped: true,
    };
    return h.githubStatus;
  });
});

afterEach(cleanup);

describe('PrPane', () => {
  it('renders the session eyebrow above the host title', () => {
    h.remoteKind = 'gitlab';

    render(<PrPane session={session} eyebrow={<span>Ship the lens eyebrow</span>} />);

    const eyebrow = screen.getByText('Ship the lens eyebrow');
    const title = screen.getByRole('heading', { level: 2 });
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the host it is actually pointed at', () => {
    h.remoteKind = 'gitlab';

    render(<PrPane session={session} />);

    expect(screen.getByRole('heading', { name: 'GitLab' })).toBeDefined();
    expect(screen.queryByText('GitHub')).toBeNull();
  });

  it('promotes the GitLab merge request title and keeps the host below it', () => {
    h.remoteKind = 'gitlab';
    h.store.sessionGitlabMr = {
      [SESSION_ID]: {
        mr: { iid: 7, title: 'Refactor authentication', state: 'open', draft: false },
      },
    };

    render(<PrPane session={session} />);

    const title = screen.getByRole('heading', { name: 'Refactor authentication', level: 2 });
    const host = screen.getByText('GitLab');

    expect(title.compareDocumentPosition(host) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('!7')).toBeDefined();
  });

  it('resolves the branch to a Bitbucket pull request when the workspace has Bitbucket connected', () => {
    h.remoteKind = 'other';
    h.store.workspaceIntegrations = { [session.workspaceId]: [{ provider: 'bitbucket' }] };

    render(<PrPane session={session} />);

    expect(h.store.refreshSessionBitbucketPr).toHaveBeenCalledWith(SESSION_ID, { silent: true });
  });

  it('leaves Bitbucket alone when the workspace never connected it', () => {
    h.remoteKind = 'other';

    render(<PrPane session={session} />);

    expect(h.store.refreshSessionBitbucketPr).not.toHaveBeenCalled();
  });

  it('does not resolve the Bitbucket pull request twice once it has an answer', () => {
    h.remoteKind = 'other';
    h.store.workspaceIntegrations = { [session.workspaceId]: [{ provider: 'bitbucket' }] };
    h.store.sessionBitbucketPr = { [SESSION_ID]: { pr: null, fetchedAt: DATE } };

    render(<PrPane session={session} />);

    expect(h.store.refreshSessionBitbucketPr).not.toHaveBeenCalled();
  });

  it('names Bitbucket and shows its strip when it is the only host with a pull request', () => {
    h.remoteKind = 'other';
    h.store.sessionBitbucketPr = {
      [SESSION_ID]: { pr: { id: 42, title: 'Raise the fuel constant', state: 'OPEN' } },
    };

    render(<PrPane session={session} />);

    expect(screen.getByRole('heading', { name: 'Raise the fuel constant' })).toBeDefined();
    expect(screen.getByText('Bitbucket')).toBeDefined();
    expect(screen.getByText('Bitbucket pull request detail')).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Bitbucket' })).toBeNull();
  });

  it('offers a tab only for the hosts that have a request', () => {
    withGithubPr();
    h.store.sessionBitbucketPr = {
      [SESSION_ID]: { pr: { id: 42, title: 'Raise the fuel constant', state: 'OPEN' } },
    };

    render(<PrPane session={session} />);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'GitHub' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Bitbucket' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'GitLab' })).toBeNull();
  });

  it('offers all three hosts as tabs when all three have a request', () => {
    withGithubPr();
    h.store.sessionGitlabMr = {
      [SESSION_ID]: { mr: { iid: 7, title: 'MR', state: 'open', draft: false } },
    };
    h.store.sessionBitbucketPr = {
      [SESSION_ID]: { pr: { id: 42, title: 'Raise the fuel constant', state: 'OPEN' } },
    };

    render(<PrPane session={session} />);

    expect(screen.getByRole('tab', { name: 'GitHub' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'GitLab' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Bitbucket' })).toBeDefined();
  });

  it('routes the open action to Bitbucket when Bitbucket is the active host', () => {
    h.remoteKind = 'other';
    h.store.sessionBitbucketPr = {
      [SESSION_ID]: { pr: { id: 42, title: 'Raise the fuel constant', state: 'OPEN' } },
    };
    const bitbucketEvents: Array<CustomEvent> = [];
    const listener = (event: Event) => bitbucketEvents.push(event as CustomEvent);
    window.addEventListener('goodboy:open-bitbucket-pr', listener);

    render(<PrPane session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open pull request from code host' }));
    window.removeEventListener('goodboy:open-bitbucket-pr', listener);

    expect(bitbucketEvents).toHaveLength(1);
    expect(bitbucketEvents[0]?.detail).toEqual({ sessionId: SESSION_ID });
  });

  it('routes the open action to GitLab for GitLab sessions', () => {
    h.remoteKind = 'gitlab';
    const gitlabEvents: Array<CustomEvent> = [];
    const gitlabListener = (event: Event) => gitlabEvents.push(event as CustomEvent);
    window.addEventListener('goodboy:open-gitlab-mr', gitlabListener);

    render(<PrPane session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open merge request from code host' }));
    window.removeEventListener('goodboy:open-gitlab-mr', gitlabListener);

    expect(gitlabEvents).toHaveLength(1);
    expect(gitlabEvents[0]?.detail).toEqual({ sessionId: SESSION_ID });
  });

  it('never opens a GitHub studio: Review owns the pull request', () => {
    withGithubPr();
    const githubEvents: Array<CustomEvent> = [];
    const githubListener = (event: Event) => githubEvents.push(event as CustomEvent);
    window.addEventListener('goodboy:open-github-session', githubListener);

    render(<PrPane session={session} />);
    window.removeEventListener('goodboy:open-github-session', githubListener);

    expect(githubEvents).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Review this pull request/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Draft a pull request/i })).toBeNull();
  });

  it('explains that a missing GitHub remote cannot be fixed with a token', () => {
    h.remoteKind = null;

    render(<PrPane session={session} />);

    expect(screen.getByRole('heading', { name: 'Connect GitHub', level: 2 })).toBeDefined();
    expect(screen.getByText(/does not have a GitHub remote/i)).toBeDefined();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
  });

  it('offers the token form when GitHub is unauthenticated on a GitHub remote', async () => {
    h.githubStatus = {
      available: true,
      mode: 'absent',
      scoped: false,
    };

    render(<PrPane session={session} />);
    const tokenInput = await screen.findByLabelText('Personal API key');
    fireEvent.change(tokenInput, { target: { value: 'ghp_valid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Personal API key')).toBeNull();
    });
  });
});
