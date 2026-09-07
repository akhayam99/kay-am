import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId, ProviderRunId, SessionId } from '@goodboy/types';
import type { GetFn, SetFn } from './types';

const hoisted = vi.hoisted(() => ({
  cancelTurn: vi.fn(async () => undefined),
  invokeAgentUpdateStatus: vi.fn(async () => undefined),
  invokeAgentList: vi.fn(async () => [] as ReadonlyArray<Agent>),
  updateSessionState: vi.fn(async () => undefined),
  listWorktreesForSession: vi.fn(async () => []),
  abandonWorktreeWriter: vi.fn(async () => ({
    path: '/repo/one',
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
}));

vi.mock('../../../features/chat/turn', () => ({ cancelTurn: hoisted.cancelTurn }));
vi.mock('../../../features/workflows/workflows', () => ({
  invokeAgentUpdateStatus: hoisted.invokeAgentUpdateStatus,
  invokeAgentList: hoisted.invokeAgentList,
}));
vi.mock('@goodboy/db', () => ({
  updateSessionState: hoisted.updateSessionState,
  listWorktreesForSession: hoisted.listWorktreesForSession,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/worktree/worktree', () => ({
  abandonWorktreeWriter: hoisted.abandonWorktreeWriter,
}));

import { forceCloseResolver } from './forceCloseResolver';

const SID = 'sess-1' as SessionId;
const STUCK = 'resolver-1' as AgentId;
const NEXT = 'resolver-2' as AgentId;
const RUN = 'run-1' as ProviderRunId;

const resolver = (over: Partial<Agent> & { id: AgentId }): Agent => ({
  sessionId: SID,
  ordinal: 0,
  name: 'resolve: reviewer on a.ts:1',
  status: 'pending',
  kind: 'resolver',
  ...over,
});

const makeStore = () => {
  const sendTurn = vi.fn(async () => undefined);
  const selectAgent = vi.fn(async () => undefined);
  const state: Record<string, unknown> = {
    recordResolvePhase: vi.fn(async () => undefined),
    sessionPhaseRuns: {
      [SID]: [
        resolver({ id: STUCK, status: 'running', ordinal: 0 }),
        resolver({ id: NEXT, status: 'pending', ordinal: 1 }),
      ],
    },
    agentTurnState: {
      [STUCK]: { kind: 'running', runId: RUN, startedAt: '2026-07-25T09:00:00.000Z' },
    },
    agentKindOverride: {},
    resolverState: {},
    drainResolveQueue: vi.fn(async () => undefined),
    sessionProjectMounts: { [SID]: [{ projectId: 'project-1', worktreePath: '/repo/one' }] },
    sessionActiveProject: { [SID]: 'project-1' },
    sessions: [
      {
        id: SID,
        activeProjectId: 'project-1',
        state: { kind: 'idle', lastActivityAt: '2026-07-25T09:00:00.000Z' },
      },
    ],
    sendTurn,
    selectAgent,
  };
  const get = (() => state) as unknown as GetFn;
  const set = ((u: unknown) => {
    const patch =
      typeof u === 'function'
        ? (u as (s: Record<string, unknown>) => Record<string, unknown>)(state)
        : (u as Record<string, unknown>);
    Object.assign(state, patch);
  }) as unknown as SetFn;
  return { state, get, set, sendTurn, selectAgent };
};

afterEach(() => vi.clearAllMocks());

describe('forceCloseResolver', () => {
  it('cancels the live run of the stuck resolver', async () => {
    const { get, set } = makeStore();
    hoisted.invokeAgentList.mockResolvedValue([
      resolver({ id: STUCK, status: 'skipped', ordinal: 0 }),
      resolver({ id: NEXT, status: 'pending', ordinal: 1 }),
    ]);

    await forceCloseResolver(set, get)(SID, STUCK);

    expect(hoisted.cancelTurn).toHaveBeenCalledWith(RUN);
    expect(hoisted.invokeAgentUpdateStatus).toHaveBeenCalledWith(
      STUCK,
      expect.objectContaining({ status: 'skipped' }),
    );
  });

  it('marks the resolver stopped and leaves its turn idle', async () => {
    const { state, get, set } = makeStore();
    hoisted.invokeAgentList.mockResolvedValue([
      resolver({ id: STUCK, status: 'skipped', ordinal: 0 }),
    ]);

    await forceCloseResolver(set, get)(SID, STUCK);

    expect((state.resolverState as Record<string, string>)[STUCK]).toBe('stopped');
    expect((state.agentTurnState as Record<string, { kind: string }>)[STUCK]?.kind).toBe('idle');
  });

  it('frees the worktree writer lease and drains the persisted queue', async () => {
    const { state, get, set } = makeStore();
    hoisted.invokeAgentList.mockResolvedValue([
      resolver({ id: STUCK, status: 'skipped', ordinal: 0 }),
      resolver({ id: NEXT, status: 'pending', ordinal: 1 }),
    ]);

    await forceCloseResolver(set, get)(SID, STUCK);

    expect(hoisted.abandonWorktreeWriter).toHaveBeenCalledWith({
      path: '/repo/one',
      holder: STUCK,
    });
    expect(state.drainResolveQueue).toHaveBeenCalledWith({ sessionId: SID });
  });
});
