import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  MountId,
  Session,
  SessionId,
  StepId,
  Project,
  ProjectId,
  TelemetryKind,
  TelemetryRecord,
  WorkflowRunId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';

type StoreState = Record<string, unknown>;

const { store, changedFiles } = vi.hoisted(() => {
  const store: { state: StoreState } = { state: {} };
  return { store, changedFiles: vi.fn() };
});

vi.mock('./store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => selector(store.state),
}));

vi.mock('../features/worktree/worktree', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/worktree/worktree')>()),
  worktreeChangedFiles: changedFiles,
}));

import {
  sumSessionCost,
  useIsSessionCollectionLoaded,
  useMountDiffStats,
  useSessionPrFetchState,
  useSessionStageInfo,
  useSortedGroupedSessions,
  useStageGroupedSessions,
} from './selectors';

type Params = {
  readonly kind: TelemetryKind;
  readonly estimatedCostUsd: number;
};

const createRecord = ({ kind, estimatedCostUsd }: Params): TelemetryRecord =>
  ({ kind, estimatedCostUsd }) as TelemetryRecord;

type AgentParams = {
  readonly id: AgentId;
  readonly kind?: string;
  readonly parentAgentId?: AgentId;
  readonly workflowRunId?: WorkflowRunId;
  readonly stepId?: StepId;
  readonly lastFinishedAt?: string;
};

const createAgent = ({
  id,
  kind,
  parentAgentId,
  workflowRunId,
  stepId,
  lastFinishedAt = '2026-07-21T10:00:00.000Z',
}: AgentParams): Agent =>
  ({
    id,
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'agent',
    status: 'completed',
    kind,
    parentAgentId,
    workflowRunId,
    stepId,
    lastFinishedAt,
    lastViewedAt: null,
  }) as unknown as Agent;

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const MOUNT_ID = 'mount-1' as MountId;

const createSession = (id: SessionId): Session =>
  ({
    id,
    workspaceId: WORKSPACE_ID,
    activeProjectId: PROJECT_ID,
    goal: 'ship the fix',
    state: { kind: 'idle', lastActivityAt: '2026-07-27T10:00:00.000Z' },
    createdAt: '2026-07-27T10:00:00.000Z',
    updatedAt: '2026-07-27T10:00:00.000Z',
    workflowRuns: [],
  }) as unknown as Session;

const createWorkspace = (): Workspace => ({ id: WORKSPACE_ID }) as unknown as Workspace;

const createProject = (kind: Project['kind'] = 'repo'): Project =>
  ({
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    rootPath: '/tmp/ws',
    name: 'project',
    kind,
  }) as unknown as Project;

const setProjectScope = ({ kind = 'repo' }: { readonly kind?: Project['kind'] } = {}): void => {
  store.state.workspaces = [createWorkspace()];
  store.state.projects = [createProject(kind)];
  store.state.sessionProjectMounts = {
    [SESSION_ID]: [
      {
        mountId: MOUNT_ID,
        projectId: PROJECT_ID,
        mountName: 'project',
        repoRoot: '/tmp/ws',
        worktreePath: '/tmp/ws-worktree',
        branch: kind === 'repo' ? 'ak/feat-thing' : '',
      },
    ],
  };
  store.state.sessionActiveProject = { [SESSION_ID]: PROJECT_ID };
};

beforeEach(() => {
  store.state = {
    sessionPhaseRuns: {},
    selectedAgentId: {},
    currentSessionId: null,
    agentKindOverride: {},
    terminalTabs: {},
    terminalSessions: {},
    sessionGithub: {},
    sessionGitlabMr: {},
    sessionOpenQuestions: {},
    sessionViewPrefs: {},
    getSessionViewPrefs: vi.fn(),
    selectedProjectIds: {},
    getSelectedProjectIds: vi.fn(),
    sessions: [],
    workspaces: [],
    projects: [],
    sessionBranches: {},
    sessionWorktrees: {},
    sessionWorktreeRecords: {},
    summarizerStatus: {},
    sessionProjectMounts: {},
    sessionActiveProject: {},
    githubStatus: null,
  };
  changedFiles.mockReset();
});

describe('useIsSessionCollectionLoaded', () => {
  const COLLECTIONS = [
    ['agents', 'sessionPhaseRuns'],
    ['plans', 'sessionPlans'],
    ['workflows', 'sessionWorkflows'],
    ['reviewDrafts', 'reviewDrafts'],
    ['externalTasks', 'sessionExternalTasks'],
    ['openQuestions', 'sessionOpenQuestions'],
    ['fileVersions', 'sessionFileVersions'],
  ] as const;

  it.each(COLLECTIONS)(
    'reads %s as never loaded while its record has no key',
    (collection, key) => {
      store.state[key] = {};

      const { result } = renderHook(() =>
        useIsSessionCollectionLoaded({ sessionId: SESSION_ID, collection }),
      );

      expect(result.current).toBe(false);
    },
  );

  it.each(COLLECTIONS)('reads %s as loaded once its key holds an empty list', (collection, key) => {
    store.state[key] = { [SESSION_ID]: [] };

    const { result } = renderHook(() =>
      useIsSessionCollectionLoaded({ sessionId: SESSION_ID, collection }),
    );

    expect(result.current).toBe(true);
  });

  it('never reads one session as loaded because a sibling loaded', () => {
    store.state.sessionWorkflows = { 'session-2': [] };

    const { result } = renderHook(() =>
      useIsSessionCollectionLoaded({ sessionId: SESSION_ID, collection: 'workflows' }),
    );

    expect(result.current).toBe(false);
  });
});

describe('useSessionStageInfo pull request freshness', () => {
  const repoSession = () => {
    const session = createSession(SESSION_ID);
    store.state.sessions = [session];
    setProjectScope();
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    store.state.sessionWorktrees = { [SESSION_ID]: ['/tmp/ws-worktree'] };
    return session;
  };

  it('does not claim a session has no PR before the first fetch lands', () => {
    const session = repoSession();
    store.state.githubStatus = { available: true };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.stage).toBe('building');
    expect(result.current.reason).toBe('checking GitHub');
  });

  it('claims no PR once that session fetch has landed with none', () => {
    const session = repoSession();
    store.state.githubStatus = { available: true };
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: null, fetchedAt: '2026-08-04T10:00:00.000Z', failedAt: null },
    };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.reason).toBe('no PR yet');
  });

  it('claims no PR right away when gh is absent, leaving nothing to wait for', () => {
    const session = repoSession();
    store.state.githubStatus = { available: false };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.reason).toBe('no PR yet');
  });

  it('says GitHub is unreachable when every attempt for that session failed', () => {
    const session = repoSession();
    store.state.githubStatus = { available: true };
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: null, fetchedAt: null, failedAt: '2026-08-04T10:00:00.000Z' },
    };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.reason).toBe('GitHub unreachable');
  });

  it('claims no PR for a mount with no branch, which no fetch will ever cover', () => {
    const session = repoSession();
    setProjectScope({ kind: 'folder' });
    store.state.sessionBranches = {};
    store.state.githubStatus = { available: true };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.reason).toBe('no PR yet');
  });

  it('claims no PR for a session whose worktree never landed', () => {
    const session = repoSession();
    store.state.sessionWorktrees = {};
    store.state.sessionProjectMounts = {};
    store.state.githubStatus = { available: true };

    const { result } = renderHook(() => useSessionStageInfo(session));

    expect(result.current.reason).toBe('no PR yet');
  });
});

describe('useSessionPrFetchState', () => {
  const fetchableSession = () => {
    const session = createSession(SESSION_ID);
    store.state.sessions = [session];
    setProjectScope();
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    store.state.sessionWorktrees = { [SESSION_ID]: ['/tmp/ws-worktree'] };
    store.state.githubStatus = { available: true };
    return session;
  };

  it('reports unknown while a fetchable session is still waiting on its first fetch', () => {
    fetchableSession();

    const { result } = renderHook(() => useSessionPrFetchState(SESSION_ID));

    expect(result.current).toBe('unknown');
  });

  it('reports known once that session fetch has landed', () => {
    fetchableSession();
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: null, fetchedAt: '2026-08-04T10:00:00.000Z', failedAt: null },
    };

    const { result } = renderHook(() => useSessionPrFetchState(SESSION_ID));

    expect(result.current).toBe('known');
  });

  it('reports unreachable once every attempt for that session failed', () => {
    fetchableSession();
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: null, fetchedAt: null, failedAt: '2026-08-04T10:00:00.000Z' },
    };

    const { result } = renderHook(() => useSessionPrFetchState(SESSION_ID));

    expect(result.current).toBe('unreachable');
  });

  it('reports known for a folder project, which never gets a pull request fetched', () => {
    const session = createSession(SESSION_ID);
    store.state.sessions = [session];
    setProjectScope({ kind: 'folder' });
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    store.state.sessionWorktrees = { [SESSION_ID]: ['/tmp/ws-worktree'] };
    store.state.githubStatus = { available: true };

    const { result } = renderHook(() => useSessionPrFetchState(SESSION_ID));

    expect(result.current).toBe('known');
  });

  it('reports known for a mount with no branch, which the sweep skips', () => {
    fetchableSession();
    setProjectScope({ kind: 'folder' });
    store.state.sessionBranches = {};

    const { result } = renderHook(() => useSessionPrFetchState(SESSION_ID));

    expect(result.current).toBe('known');
  });
});

describe('sumSessionCost', () => {
  it('sums turn costs and skips summarizer costs', () => {
    const records = [
      createRecord({ kind: 'turn', estimatedCostUsd: 1.25 }),
      createRecord({ kind: 'summarizer', estimatedCostUsd: 8 }),
      createRecord({ kind: 'turn', estimatedCostUsd: 0.5 }),
    ];

    expect(sumSessionCost(records)).toBe(1.75);
  });
});

describe('useSortedGroupedSessions', () => {
  it('derives stages with the default stage grouping', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    const sessions = [createSession(SESSION_ID)];

    const { result } = renderHook(() => useSortedGroupedSessions(WORKSPACE_ID, sessions));

    expect(result.current).toEqual([{ key: 'building', sessions }]);
  });
});

describe('useStageGroupedSessions', () => {
  it('groups a repo session by its pull request stage', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: { number: 12, state: 'merged', isDraft: false } },
    };
    const sessions = [createSession(SESSION_ID)];

    const { result } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));

    expect(result.current).toEqual([{ key: 'done', sessions }]);
  });

  it('groups a GitLab-only session by its merge request stage', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    store.state.sessionGitlabMr = {
      [SESSION_ID]: {
        mr: { iid: 7, state: 'merged', draft: false, sourceBranch: 'ak/feat-thing' },
      },
    };
    const sessions = [createSession(SESSION_ID)];

    const { result } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));

    expect(result.current).toEqual([{ key: 'done', sessions }]);
  });

  it('keeps a branchless simple-workspace session out of the pull request stages', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: '' };
    store.state.sessionGithub = {
      [SESSION_ID]: { pr: { number: 12, state: 'merged', isDraft: false } },
    };
    const sessions = [createSession(SESSION_ID)];

    const { result } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));

    expect(result.current).toEqual([{ key: 'building', sessions }]);
  });

  it('keeps the same array reference when an unrelated store field changes', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    const sessions = [createSession(SESSION_ID)];

    const { result, rerender } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));
    const first = result.current;

    store.state.currentSessionId = 'unrelated-session' as SessionId;
    rerender();

    expect(result.current).toBe(first);
  });

  it('returns a new reference when a session object is replaced under the same id', () => {
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing' };
    let sessions = [createSession(SESSION_ID)];

    const { result, rerender } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));
    const first = result.current;

    sessions = [{ ...createSession(SESSION_ID), goal: 'renamed goal' }];
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current[0]?.sessions[0]?.goal).toBe('renamed goal');
  });

  it('returns a new reference when a session is added', () => {
    const otherId = 'session-2' as SessionId;
    store.state.workspaces = [createWorkspace()];
    store.state.sessionBranches = { [SESSION_ID]: 'ak/feat-thing', [otherId]: 'ak/feat-two' };
    let sessions = [createSession(SESSION_ID)];

    const { result, rerender } = renderHook(() => useStageGroupedSessions(WORKSPACE_ID, sessions));
    const first = result.current;

    sessions = [...sessions, createSession(otherId)];
    rerender();

    expect(result.current).not.toBe(first);
  });
});

describe('useMountDiffStats', () => {
  const worktreeRow = ({
    id,
    worktreePath,
  }: {
    readonly id: string;
    readonly worktreePath: string;
  }) => ({ id, sessionId: SESSION_ID, worktreePath, branch: 'ak/feat', parallelIndex: 0 });

  it('fetches nothing for a session with no worktrees', () => {
    const { result } = renderHook(() => useMountDiffStats(SESSION_ID));

    expect(result.current.size).toBe(0);
    expect(changedFiles).not.toHaveBeenCalled();
  });

  it('keys one stat per worktree path', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [
        worktreeRow({ id: 'wt-1', worktreePath: '/tmp/a' }),
        worktreeRow({ id: 'wt-2', worktreePath: '/tmp/b' }),
      ],
    };
    changedFiles.mockImplementation(({ worktreePath: path }: { worktreePath: string }) =>
      Promise.resolve(
        path === '/tmp/a'
          ? { paths: ['x.ts'], additions: 2000, deletions: 200, numstat: '' }
          : { paths: [], additions: 0, deletions: 0, numstat: '' },
      ),
    );

    const { result } = renderHook(() => useMountDiffStats(SESSION_ID));

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('/tmp/a')).toEqual({ additions: 2000, deletions: 200 });
    expect(result.current.get('/tmp/b')).toEqual({ additions: 0, deletions: 0 });
  });

  it('swallows one failing path to zero instead of losing the whole map', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [
        worktreeRow({ id: 'wt-1', worktreePath: '/tmp/a' }),
        worktreeRow({ id: 'wt-2', worktreePath: '/tmp/gone' }),
      ],
    };
    changedFiles.mockImplementation(({ worktreePath: path }: { worktreePath: string }) =>
      path === '/tmp/gone'
        ? Promise.reject(new Error('not a worktree'))
        : Promise.resolve({ paths: ['x.ts'], additions: 3, deletions: 1, numstat: '' }),
    );

    const { result } = renderHook(() => useMountDiffStats(SESSION_ID));

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('/tmp/a')).toEqual({ additions: 3, deletions: 1 });
    expect(result.current.get('/tmp/gone')).toEqual({ additions: 0, deletions: 0 });
  });

  it('skips a worktree row that carries no path', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [
        worktreeRow({ id: 'wt-1', worktreePath: '' }),
        worktreeRow({ id: 'wt-2', worktreePath: '/tmp/b' }),
      ],
    };
    changedFiles.mockResolvedValue({ paths: [], additions: 0, deletions: 0, numstat: '' });

    const { result } = renderHook(() => useMountDiffStats(SESSION_ID));

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(changedFiles).toHaveBeenCalledTimes(1);
    expect(changedFiles).toHaveBeenCalledWith({ worktreePath: '/tmp/b' });
  });

  it('refetches when the last turn finishes', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [worktreeRow({ id: 'wt-1', worktreePath: '/tmp/a' })],
    };
    changedFiles.mockResolvedValue({ paths: [], additions: 1, deletions: 0, numstat: '' });

    const { rerender } = renderHook(() => useMountDiffStats(SESSION_ID));
    await waitFor(() => expect(changedFiles).toHaveBeenCalledTimes(1));

    store.state.sessionPhaseRuns = {
      [SESSION_ID]: [createAgent({ id: AGENT_ID, lastFinishedAt: '2026-08-22T10:00:00.000Z' })],
    };
    rerender();

    await waitFor(() => expect(changedFiles).toHaveBeenCalledTimes(2));
  });

  it('asks git once when several surfaces read the same mount at the same time', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [worktreeRow({ id: 'wt-1', worktreePath: '/tmp/a' })],
    };
    changedFiles.mockResolvedValue({ paths: [], additions: 4, deletions: 0, numstat: '' });

    const { result } = renderHook(() => [
      useMountDiffStats(SESSION_ID),
      useMountDiffStats(SESSION_ID),
      useMountDiffStats(SESSION_ID),
    ]);

    await waitFor(() => expect(result.current[0]?.get('/tmp/a')).toBeDefined());
    expect(result.current[2]?.get('/tmp/a')).toEqual({ additions: 4, deletions: 0 });
    expect(changedFiles).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the window comes back into view', async () => {
    store.state.sessionWorktreeRecords = {
      [SESSION_ID]: [worktreeRow({ id: 'wt-1', worktreePath: '/tmp/a' })],
    };
    changedFiles.mockResolvedValue({ paths: [], additions: 1, deletions: 0, numstat: '' });

    renderHook(() => useMountDiffStats(SESSION_ID));
    await waitFor(() => expect(changedFiles).toHaveBeenCalledTimes(1));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(changedFiles).toHaveBeenCalledTimes(2));
  });

  it('returns an empty map without a session', () => {
    const { result } = renderHook(() => useMountDiffStats(null));

    expect(result.current.size).toBe(0);
    expect(changedFiles).not.toHaveBeenCalled();
  });
});

describe('shared project filtering', () => {
  it('feeds the same project selection into sidebar and board grouping', () => {
    const mounted = createSession(SESSION_ID);
    const unmounted = createSession('session-2' as SessionId);
    setProjectScope();
    store.state.selectedProjectIds = { [WORKSPACE_ID]: [PROJECT_ID] };
    store.state.sessionProjectMounts = {
      [SESSION_ID]: [
        {
          projectId: PROJECT_ID,
          mountName: 'project',
          repoRoot: '/tmp/ws',
          worktreePath: '/tmp/ws-worktree',
          branch: 'ak/feat-thing',
        },
      ],
      [unmounted.id]: [],
    };
    const { result } = renderHook(() => ({
      sidebar: useSortedGroupedSessions(WORKSPACE_ID, [mounted, unmounted]),
      board: useStageGroupedSessions(WORKSPACE_ID, [mounted, unmounted]),
    }));
    const sidebarIds = result.current.sidebar.flatMap((group) =>
      group.sessions.map((session) => session.id),
    );
    const boardIds = result.current.board.flatMap((group) =>
      group.sessions.map((session) => session.id),
    );
    expect(sidebarIds).toEqual([SESSION_ID]);
    expect(boardIds).toEqual([SESSION_ID]);
  });
});
