// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Agent, AgentId, BranchCommit, Session, SessionId, WorkspaceId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  worktreePath: '/tmp/wt' as string | null,
  listTurnEventsForSession: vi.fn(async () => [] as ReadonlyArray<unknown>),
  listBranchCommits: vi.fn(async () => [] as ReadonlyArray<BranchCommit>),
  openDiffLens: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof h.state) => T) => selector(h.state),
  useDiffComments: () => [],
  useSessionLoading: () => ({ agents: false, transcript: false }),
  EMPTY_ARRAY: [] as never[],
  agentHasUnread: () => false,
}));

vi.mock('../../hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));

vi.mock('../../../../shared/components/DogMascot', () => ({ DogMascot: () => null }));

vi.mock('@goodboy/db', () => ({ listTurnEventsForSession: h.listTurnEventsForSession }));

vi.mock('../../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('../../../worktree/worktree', () => ({ listBranchCommits: h.listBranchCommits }));

vi.mock('../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    repoRoot: '/tmp/repo',
    worktreePath: h.worktreePath,
    branch: 'ak/resolver',
    mountName: null,
    workspaceId: 'ws-1',
  }),
}));

vi.mock('../../../context/components/ContextPanel/strips/PendingResolutionsStrip', () => ({
  PendingResolutionsStrip: () => <div data-testid="pending-strip" />,
}));

vi.mock('./ResolverRows', () => ({
  ResolverRows: ({
    entries,
    isMuted,
    canOpenDiff,
    reportedCommitShaByAgentId,
    diffTargetByAgentId,
    onOpenDiff,
    onOpenChat,
  }: {
    entries: ReadonlyArray<{ agent: Agent }>;
    isMuted: boolean;
    canOpenDiff: boolean;
    reportedCommitShaByAgentId: ReadonlyMap<AgentId, string>;
    diffTargetByAgentId: ReadonlyMap<
      AgentId,
      { kind: 'unknown' } | { kind: 'commit'; sha: string } | { kind: 'working' }
    >;
    onOpenDiff: (agentId: AgentId) => void;
    onOpenChat: (agentId: AgentId) => void;
  }) => (
    <ul data-muted={String(isMuted)}>
      {entries.map(({ agent }) => {
        const target = diffTargetByAgentId.get(agent.id) ?? { kind: 'unknown' as const };
        return (
          <li
            key={agent.id}
            data-testid="resolver-row"
            data-muted={String(isMuted)}
            data-reported-sha={reportedCommitShaByAgentId.get(agent.id) ?? ''}
            data-diff-kind={target.kind}
            data-diff-sha={target.kind === 'commit' ? target.sha : ''}
          >
            <button
              type="button"
              aria-label={`open chat ${agent.name}`}
              onClick={() => onOpenChat(agent.id)}
            >
              {agent.name}
            </button>
            {canOpenDiff && (
              <button
                type="button"
                aria-label={`open diff ${agent.name}`}
                onClick={() => onOpenDiff(agent.id)}
              />
            )}
          </li>
        );
      })}
    </ul>
  ),
}));

import { ResolverAgentsLane } from './index';

const WS_ID = 'ws-1' as WorkspaceId;
const SESSION_ID = 'session-1' as SessionId;
const DONE_AT = '2026-08-03T10:00:00.000Z' as Agent['doneAt'];

const session = {
  id: SESSION_ID,
  workspaceId: WS_ID,
  workflowRuns: [],
} as unknown as Session;

const buildResolver = (overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent =>
  ({
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'resolver one',
    status: 'running',
    kind: 'resolver',
    ...overrides,
  }) as Agent;

const setResolvers = (agents: ReadonlyArray<Agent>) => {
  h.state.sessionPhaseRuns = { [SESSION_ID]: agents };
};

type RenderLaneParams = {
  readonly mode?: 'active' | 'finished';
  readonly onCompletedCountChange?: (completedCount: number) => void;
  readonly onActiveCountChange?: (activeCount: number) => void;
};

const renderLane = ({
  mode = 'active',
  onCompletedCountChange,
  onActiveCountChange,
}: RenderLaneParams = {}) =>
  render(
    <ResolverAgentsLane
      session={session}
      mode={mode}
      inspectedResolverId={null}
      onInspectResolver={() => undefined}
      onCompletedCountChange={onCompletedCountChange}
      onActiveCountChange={onActiveCountChange}
    />,
  );

beforeEach(() => {
  h.worktreePath = '/tmp/wt';
  h.openDiffLens.mockClear();
  h.listTurnEventsForSession.mockReset();
  h.listTurnEventsForSession.mockResolvedValue([]);
  h.listBranchCommits.mockReset();
  h.listBranchCommits.mockResolvedValue([]);
  Object.keys(h.state).forEach((key) => delete h.state[key]);
  Object.assign(h.state, {
    sessions: [session],
    workspaces: [{ id: WS_ID, rootPath: '/tmp/repo', kind: 'repo' }],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionBranches: { [SESSION_ID]: 'ak/resolver' },
    currentSessionId: SESSION_ID,
    sessionPhaseRuns: {},
    agentKindOverride: {},
    resolverState: {},
    selectedAgentId: {},
    sessionGithub: {},
    sessionPendingResolutions: {},
    sessionResolvedThreads: {},
    resolverThreadOutcomes: {},
    sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
    transcripts: {},
    agentRunHistory: {},
    selectAgent: vi.fn(),
    openDiffLens: h.openDiffLens,
    resolveGithubThread: vi.fn(),
    resolveAgentThreads: vi.fn(),
    dequeueResolution: vi.fn(),
  });
});

afterEach(cleanup);

describe('ResolverAgentsLane', () => {
  it('renders nothing in active mode with no active resolvers', () => {
    setResolvers([]);
    const { container } = renderLane();

    expect(screen.queryByTestId('resolver-row')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing in finished mode with no completed resolvers', () => {
    setResolvers([buildResolver({ id: 'active' as AgentId, name: 'active one' })]);
    const { container } = renderLane({ mode: 'finished' });

    expect(screen.queryByTestId('resolver-row')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('never offers a resolve-comments link in the lane footer', () => {
    setResolvers([buildResolver({ id: 'solo' as AgentId, name: 'solo resolver' })]);
    renderLane();

    expect(screen.queryByRole('button', { name: /Resolve comments/ })).toBeNull();
  });

  it('lists finished resolvers muted in finished mode', () => {
    setResolvers([
      buildResolver({ id: 'active-old' as AgentId, name: 'active old', ordinal: 0 }),
      buildResolver({
        id: 'done-old' as AgentId,
        name: 'done old',
        ordinal: 1,
        status: 'completed',
        doneAt: DONE_AT,
      }),
      buildResolver({ id: 'active-new' as AgentId, name: 'active new', ordinal: 2 }),
      buildResolver({
        id: 'done-new' as AgentId,
        name: 'done new',
        ordinal: 3,
        status: 'completed',
        doneAt: DONE_AT,
      }),
    ]);

    const { rerender } = renderLane();
    expect(
      screen.getAllByTestId('resolver-row').map((row) => row.getAttribute('data-muted')),
    ).toEqual(['false', 'false']);

    rerender(
      <ResolverAgentsLane
        session={session}
        mode="finished"
        inspectedResolverId={null}
        onInspectResolver={() => undefined}
      />,
    );

    expect(
      screen.getAllByTestId('resolver-row').map((row) => row.getAttribute('data-muted')),
    ).toEqual(['true', 'true']);
  });

  it('keeps a resolver active while its thread is still open', () => {
    setResolvers([
      buildResolver({
        id: 'explained' as AgentId,
        name: 'explained resolver',
        status: 'completed',
      }),
    ]);
    renderLane();

    expect(screen.getByTestId('resolver-row')).toBeTruthy();
  });

  it('settles a resolver on a thread this session closed, before github echoes it', () => {
    h.state.sessionResolvedThreads = { [SESSION_ID]: ['PRRT_1'] };
    setResolvers([
      buildResolver({
        id: 'closed' as AgentId,
        name: 'closed resolver',
        status: 'completed',
        sourceThreadId: 'PRRT_1',
      }),
    ]);
    renderLane();

    expect(screen.queryByTestId('resolver-row')).toBeNull();
  });

  it('reports active and completed counts to the parent', () => {
    const onActiveCountChange = vi.fn();
    const onCompletedCountChange = vi.fn();
    setResolvers([
      buildResolver({ id: 'a' as AgentId, name: 'a' }),
      buildResolver({
        id: 'b' as AgentId,
        name: 'b',
        ordinal: 1,
        status: 'completed',
        doneAt: DONE_AT,
      }),
    ]);
    renderLane({ onActiveCountChange, onCompletedCountChange });

    expect(onActiveCountChange).toHaveBeenLastCalledWith(1);
    expect(onCompletedCountChange).toHaveBeenLastCalledWith(1);
  });

  it('recovers each card reported sha from the session event read', async () => {
    h.listBranchCommits.mockResolvedValue([
      {
        sha: 'abcdef1234567890',
        shortSha: 'abcdef1',
        subject: 'fix: resolve review',
        author: 'agent',
        timestamp: 1,
        pushed: false,
        parentSha: null,
      },
    ]);
    h.listTurnEventsForSession.mockResolvedValue([
      {
        kind: 'assistant_text',
        runId: 'run-1',
        delta: '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">>',
        at: '2026-07-29T00:00:00.000Z',
      },
    ]);
    setResolvers([
      buildResolver({
        id: 'resolver-1' as AgentId,
        runId: 'run-1' as never,
        sourceThreadId: 'PRRT_1',
      }),
    ]);

    renderLane();

    await waitFor(() =>
      expect(screen.getByTestId('resolver-row').getAttribute('data-reported-sha')).toBe(
        'abcdef1234567890',
      ),
    );
    expect(h.listTurnEventsForSession).toHaveBeenCalledOnce();
  });

  it('does not advertise a transcript sha missing from the branch', async () => {
    h.listBranchCommits.mockResolvedValue([
      {
        sha: 'repointed1234567890',
        shortSha: 'repoint',
        subject: 'fix: rewritten resolution',
        author: 'agent',
        timestamp: 1,
        pushed: false,
        parentSha: null,
      },
    ]);
    h.listTurnEventsForSession.mockResolvedValue([
      {
        kind: 'assistant_text',
        runId: 'run-1',
        delta: '<<comment-resolved threadId="PRRT_1" commitSha="obsolete1234567890">>',
        at: '2026-07-29T00:00:00.000Z',
      },
    ]);
    setResolvers([
      buildResolver({
        id: 'resolver-1' as AgentId,
        runId: 'run-1' as never,
        sourceThreadId: 'PRRT_1',
      }),
    ]);

    renderLane();

    await waitFor(() => expect(h.listBranchCommits).toHaveBeenCalledOnce());
    expect(screen.getByTestId('resolver-row').getAttribute('data-reported-sha')).toBe('');
  });

  it('opens the diff at the commit of the resolver whose shortcut was clicked', () => {
    h.state.resolverThreadOutcomes = {
      'resolver-a': { PRRT_1: { kind: 'resolved', commitSha: 'aaaaaaa1111' } },
      'resolver-b': { PRRT_2: { kind: 'resolved', commitSha: 'bbbbbbb2222' } },
    };
    setResolvers([
      buildResolver({ id: 'resolver-a' as AgentId, name: 'first', sourceThreadId: 'PRRT_1' }),
      buildResolver({
        id: 'resolver-b' as AgentId,
        name: 'second',
        ordinal: 1,
        sourceThreadId: 'PRRT_2',
      }),
    ]);
    renderLane();

    fireEvent.click(screen.getByRole('button', { name: 'open diff second' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'commit',
      sha: 'bbbbbbb2222',
      path: null,
    });
  });

  it('opens the uncommitted changes when the resolver has no commit yet', () => {
    setResolvers([
      buildResolver({ id: 'resolver-a' as AgentId, name: 'first', sourceThreadId: 'PRRT_1' }),
    ]);
    renderLane();

    expect(screen.getByTestId('resolver-row').getAttribute('data-diff-sha')).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'open diff first' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, { kind: 'working', path: null });
  });

  it('does not claim the working tree diff until the event read and branch commits both settle', async () => {
    setResolvers([
      buildResolver({ id: 'resolver-a' as AgentId, name: 'first', sourceThreadId: 'PRRT_1' }),
    ]);
    renderLane();

    expect(screen.getByTestId('resolver-row').getAttribute('data-diff-kind')).toBe('unknown');

    await waitFor(() =>
      expect(screen.getByTestId('resolver-row').getAttribute('data-diff-kind')).toBe('working'),
    );
  });

  it('offers no diff shortcut when the session has no worktree', () => {
    h.worktreePath = null;
    setResolvers([
      buildResolver({ id: 'resolver-a' as AgentId, name: 'first', sourceThreadId: 'PRRT_1' }),
    ]);
    renderLane();

    expect(screen.queryByRole('button', { name: 'open diff first' })).toBeNull();
  });

  it('does not reveal the chat when clicking a pending resolver', () => {
    const dispatched: Array<string> = [];
    const original = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event: Event) => {
      dispatched.push(event.type);
      return original(event);
    };

    setResolvers([
      buildResolver({
        id: 'queued' as AgentId,
        name: 'queued resolver',
        status: 'pending',
      }),
    ]);
    renderLane();

    fireEvent.click(screen.getByRole('button', { name: 'open chat queued resolver' }));

    expect(dispatched).not.toContain('goodboy:reveal-chat');
    window.dispatchEvent = original;
  });

  it('reveals the chat when clicking a running resolver', () => {
    const dispatched: Array<string> = [];
    const original = window.dispatchEvent.bind(window);
    window.dispatchEvent = (event: Event) => {
      dispatched.push(event.type);
      return original(event);
    };

    setResolvers([
      buildResolver({
        id: 'live' as AgentId,
        name: 'live resolver',
        status: 'running',
      }),
    ]);
    renderLane();

    fireEvent.click(screen.getByRole('button', { name: 'open chat live resolver' }));

    expect(dispatched).toContain('goodboy:reveal-chat');
    window.dispatchEvent = original;
  });
});
