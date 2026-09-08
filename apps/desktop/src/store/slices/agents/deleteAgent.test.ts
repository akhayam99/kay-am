import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId, ProviderRunId, SessionId } from '@goodboy/types';
import type { GetFn, SetFn } from './types';

const hoisted = vi.hoisted(() => ({
  cancelTurn: vi.fn(async () => undefined),
  deleteAttachment: vi.fn(async () => undefined),
  invokeAgentList: vi.fn(async () => [] as ReadonlyArray<Agent>),
  updateSessionState: vi.fn(async () => undefined),
  listWorktreesForSession: vi.fn(
    async () => [] as ReadonlyArray<{ readonly worktreePath: string; readonly projectId?: string }>,
  ),
  abandonWorktreeWriter: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  execute: vi.fn(async () => undefined),
}));

vi.mock('../../../features/chat/turn', () => ({
  cancelTurn: hoisted.cancelTurn,
  deleteAttachment: hoisted.deleteAttachment,
}));
vi.mock('../../../features/workflows/workflows', () => ({
  invokeAgentList: hoisted.invokeAgentList,
}));
vi.mock('@goodboy/db', () => ({
  updateSessionState: hoisted.updateSessionState,
  listWorktreesForSession: hoisted.listWorktreesForSession,
}));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: { execute: hoisted.execute } }));
vi.mock('../../../features/worktree/worktree', () => ({
  abandonWorktreeWriter: hoisted.abandonWorktreeWriter,
}));

import { deleteAgent } from './deleteAgent';

const SID = 'sess-1' as SessionId;
const DOOMED = 'resolver-1' as AgentId;
const RUN = 'run-1' as ProviderRunId;
const PATH = '/repo/one';

const resolver = (over: Partial<Agent> & { id: AgentId }): Agent => ({
  sessionId: SID,
  ordinal: 0,
  name: 'resolve: reviewer on a.ts:1',
  status: 'pending',
  kind: 'resolver',
  ...over,
});

const makeStore = ({ isMounted = true }: { readonly isMounted?: boolean } = {}) => {
  const state: Record<string, unknown> = {
    sessionPhaseRuns: { [SID]: [resolver({ id: DOOMED, status: 'running' })] },
    agentTurnState: {
      [DOOMED]: { kind: 'running', runId: RUN, startedAt: '2026-07-25T09:00:00.000Z' },
    },
    agentAttachments: {},
    agentDraft: {},
    agentQueue: {},
    agentRunHistory: {},
    agentModelOverride: {},
    agentProviderOverride: {},
    agentEffortOverride: {},
    agentKindOverride: {},
    selectedAgentId: {},
    transcripts: {},
    sessionWorktrees: {},
    sessionProjectMounts: isMounted
      ? { [SID]: [{ projectId: 'project-1', worktreePath: PATH }] }
      : {},
    sessionActiveProject: isMounted ? { [SID]: 'project-1' } : {},
    sessions: [{ id: SID, activeProjectId: 'project-1', state: { kind: 'idle' } }],
  };
  const get = (() => state) as unknown as GetFn;
  const set = ((u: unknown) => {
    const patch =
      typeof u === 'function'
        ? (u as (s: Record<string, unknown>) => Record<string, unknown>)(state)
        : (u as Record<string, unknown>);
    Object.assign(state, patch);
  }) as unknown as SetFn;
  return { state, get, set };
};

afterEach(() => vi.clearAllMocks());

describe('deleteAgent', () => {
  it('gives the worktree back before the agent row goes away', async () => {
    const { get, set } = makeStore();
    hoisted.invokeAgentList.mockResolvedValue([]);

    await deleteAgent(set, get)(SID, DOOMED);

    expect(hoisted.cancelTurn).toHaveBeenCalledWith(RUN);
    expect(hoisted.abandonWorktreeWriter).toHaveBeenCalledWith({ path: PATH, holder: DOOMED });
  });

  it('finds the worktree of a session the loaded workspace never mounted', async () => {
    const { get, set } = makeStore({ isMounted: false });
    hoisted.invokeAgentList.mockResolvedValue([]);
    hoisted.listWorktreesForSession.mockResolvedValue([{ worktreePath: PATH }]);

    await deleteAgent(set, get)(SID, DOOMED);

    expect(hoisted.abandonWorktreeWriter).toHaveBeenCalledWith({ path: PATH, holder: DOOMED });
  });
});
