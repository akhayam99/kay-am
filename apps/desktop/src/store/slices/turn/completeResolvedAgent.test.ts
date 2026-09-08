import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId, IsoDateTime, ResolveThread, SessionId } from '@goodboy/types';
import { createResolveSlice } from '../resolve';
import { resolveInitialState } from '../resolve/state';
import { buildResolutionReplyBody } from '../github/buildResolutionReplyBody';
import { threadOutcome } from '../resolve/threadOutcome';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({
  invokeAgentList: vi.fn(async () => [] as ReadonlyArray<Agent>),
  invokeAgentUpdateStatus: vi.fn(async () => undefined),
}));

const resolveMockState = vi.hoisted(() => ({ reset: (): void => {} }));
beforeEach(() => resolveMockState.reset());

vi.mock('@goodboy/db', async () => {
  const queries = (
    await import('../resolve/testing/createResolveQueryMocks')
  ).createResolveQueryMocks();
  resolveMockState.reset = queries.resetResolveQueryMocks;
  return {
    ...queries,
    listOpenQuestionsForSession: vi.fn(async () => []),
  };
});

vi.mock('../../../features/workflows/workflows', () => ({
  invokeAgentList: h.invokeAgentList,
  invokeAgentUpdateStatus: h.invokeAgentUpdateStatus,
}));

import { completeResolvedAgent } from './completeResolvedAgent';

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const NOW = '2026-07-30T00:00:00.000Z' as IsoDateTime;

const agent: Agent = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'resolver',
  kind: 'resolver',
  status: 'running',
  sourceThreadIds: ['PRRT_1'],
};

type Harness = {
  readonly state: {
    sessionPhaseRuns: Record<SessionId, ReadonlyArray<Agent>>;
    agentKindOverride: Record<AgentId, never>;
    sessionResolveThreads: Record<SessionId, ReadonlyArray<ResolveThread>>;
    refreshUnreadWorkspaces: ReturnType<typeof vi.fn>;
    emitNotification: ReturnType<typeof vi.fn>;
  };
  readonly set: SetFn;
  readonly get: GetFn;
  readonly actions: ReturnType<typeof createResolveSlice>;
};

type HarnessParams = Record<string, never>;

const createHarness = ({}: HarnessParams): Harness => {
  const state = {
    ...resolveInitialState,
    sessionActiveProject: {},
    sessionGithub: {},
    sessionPhaseRuns: { [SESSION_ID]: [agent] },
    agentKindOverride: {},
    refreshUnreadWorkspaces: vi.fn(async () => undefined),
    emitNotification: vi.fn(async () => undefined),
  };
  const set = ((update: unknown) => {
    if (typeof update === 'function') {
      Object.assign(state, update(state));
      return;
    }
    Object.assign(state, update);
  }) as SetFn;
  const get = (() => state) as unknown as GetFn;
  const actions = createResolveSlice({ set, get });
  Object.assign(state, actions);
  h.invokeAgentList.mockImplementation(async () => state.sessionPhaseRuns[SESSION_ID] ?? []);
  return { state, set, get, actions };
};

type OutcomeParams = { readonly state: Harness['state']; readonly threadId: string };
const rowFor = ({ state, threadId }: OutcomeParams): ResolveThread | undefined =>
  (state.sessionResolveThreads[SESSION_ID] ?? []).find((row) => row.threadId === threadId);
const outcomeFor = ({ state, threadId }: OutcomeParams) => {
  const row = rowFor({ state, threadId });
  return row === undefined ? null : threadOutcome({ row });
};
const settledThreadIds = ({ state }: { readonly state: Harness['state'] }) =>
  (state.sessionResolveThreads[SESSION_ID] ?? [])
    .filter((row) => threadOutcome({ row }) !== null)
    .map((row) => row.threadId);

describe('completeResolvedAgent', () => {
  it('uses verdict thread ids when a legacy resolver has no source thread ids', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPhaseRuns[SESSION_ID] = [{ ...agent, sourceThreadIds: undefined }];
    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });
    expect(rowFor({ state, threadId: 'PRRT_1' })).toMatchObject({
      state: 'fixed',
      disposition: 'fix',
      commitShas: ['abcdef1234567890'],
    });
  });

  beforeEach(() => {
    h.invokeAgentList.mockClear();
    h.invokeAgentUpdateStatus.mockClear();
  });

  it('uses the analysis summary as the explanation posted on closure', async () => {
    const { state, set, get } = createHarness({});
    const summary = 'The existing guard already rejects an empty value.';

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: `<<comment-analysis threadId="PRRT_1" verdict="wontfix" summary="${summary}">>`,
      now: () => NOW,
    });

    const outcome = outcomeFor({ state, threadId: 'PRRT_1' });
    expect(outcome).toEqual({ kind: 'analyzed', reply: summary, verdict: 'wontfix' });
    expect(
      buildResolutionReplyBody({ closure: outcome ?? undefined, prUrl: null, isAttributed: false }),
    ).toBe(summary);
  });

  it('keeps an agent that fixed two threads and asked about a third in needs-you', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPhaseRuns = {
      [SESSION_ID]: [{ ...agent, sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'] }],
    };

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText:
        '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">> <<comment-resolved threadId="PRRT_2" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });

    expect(settledThreadIds({ state })).toEqual(['PRRT_1', 'PRRT_2']);
    expect(outcomeFor({ state, threadId: 'PRRT_3' })).toBeNull();
  });

  it('settles an agent as committed once every owned thread has an outcome', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPhaseRuns = {
      [SESSION_ID]: [{ ...agent, sourceThreadIds: ['PRRT_1', 'PRRT_2'] }],
    };

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText:
        '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">> <<comment-wontfix threadId="PRRT_2" reason="intentional">>',
      now: () => NOW,
    });

    expect(settledThreadIds({ state })).toEqual(['PRRT_1', 'PRRT_2']);
  });

  it('lets a later marker supersede a settled thread without wiping its siblings', async () => {
    const { state, set, get, actions } = createHarness({});
    state.sessionPhaseRuns = {
      [SESSION_ID]: [{ ...agent, sourceThreadIds: ['PRRT_1', 'PRRT_2'] }],
    };
    await actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent: state.sessionPhaseRuns[SESSION_ID]![0]!,
      assistantText:
        '<<comment-wontfix threadId="PRRT_1" reason="the branch is unreachable">> <<comment-analysis threadId="PRRT_2" verdict="wontfix" summary="already covered">>',
    });

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });

    expect(outcomeFor({ state, threadId: 'PRRT_1' })).toEqual({
      kind: 'resolved',
      commitSha: 'abcdef1234567890',
    });
    expect(outcomeFor({ state, threadId: 'PRRT_2' })).toEqual({
      kind: 'analyzed',
      reply: 'already covered',
      verdict: 'wontfix',
    });
  });

  it('records an amended sha on the row a first turn already settled', async () => {
    const { state, set, get, actions } = createHarness({});
    const oldSha = 'aaaaaaaaaaaaaaaa';
    const newSha = 'bbbbbbbbbbbbbbbb';
    await actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: `<<comment-resolved threadId="PRRT_1" commitSha="${oldSha}">>`,
    });

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: `<<comment-resolved threadId="PRRT_1" commitSha="${newSha}">>`,
      now: () => NOW,
    });

    expect(rowFor({ state, threadId: 'PRRT_1' })).toMatchObject({
      state: 'fixed',
      commitShas: [newSha],
    });
  });

  it('does not downgrade a resolved marker for the same thread', async () => {
    const { state, set, get } = createHarness({});

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText:
        '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">> <<comment-wontfix threadId="PRRT_1" reason="not needed">> <<comment-analysis threadId="PRRT_1" verdict="wontfix" summary="no change needed">>',
      now: () => NOW,
    });

    expect(outcomeFor({ state, threadId: 'PRRT_1' })).toEqual({
      kind: 'resolved',
      commitSha: 'abcdef1234567890',
    });
  });

  it('completes a plain non-workflow agent via raw fallback without notifying the inbox', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPhaseRuns = {
      [SESSION_ID]: [{ ...agent, kind: 'implementer', sourceThreadIds: undefined }],
    };

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: 'did the thing, no markers here',
      now: () => NOW,
    });

    expect(h.invokeAgentUpdateStatus).toHaveBeenCalledWith(
      AGENT_ID,
      expect.objectContaining({ status: 'completed' }),
    );
    expect(state.emitNotification).not.toHaveBeenCalled();
  });
  it('leaves a thread the agent does not own out of its rows', async () => {
    const { state, set, get } = createHarness({});
    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: '<<comment-resolved threadId="PRRT_OTHER" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });
    expect(rowFor({ state, threadId: 'PRRT_OTHER' })).toBeUndefined();
  });
});
