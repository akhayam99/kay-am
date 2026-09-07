import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId, IsoDateTime, PendingResolution, SessionId } from '@goodboy/types';
import { createResolveSlice } from '../resolve';
import { resolveInitialState } from '../resolve/state';
import { buildResolutionReplyBody } from '../github/buildResolutionReplyBody';
import type { ResolverThreadOutcome } from '../../types';
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
    resolverState: Record<AgentId, string>;
    resolverThreadOutcomes: Record<AgentId, Record<string, ResolverThreadOutcome>>;
    sessionPendingResolutions: Record<SessionId, ReadonlyArray<PendingResolution>>;
    queueResolution: ReturnType<typeof vi.fn>;
    refreshUnreadWorkspaces: ReturnType<typeof vi.fn>;
    activateNextResolver: ReturnType<typeof vi.fn>;
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
    sessionResolvedThreads: {},
    sessionActiveProject: {},
    sessionGithub: {},
    sessionPhaseRuns: { [SESSION_ID]: [agent] },
    agentKindOverride: {},
    resolverState: {},
    resolverThreadOutcomes: {},
    sessionPendingResolutions: {},
    queueResolution: vi.fn(async () => undefined),
    refreshUnreadWorkspaces: vi.fn(async () => undefined),
    activateNextResolver: vi.fn(async () => undefined),
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

describe('completeResolvedAgent', () => {
  it('uses verdict thread ids when a legacy resolver has no source thread ids', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPhaseRuns[SESSION_ID] = [{ ...agent, sourceThreadIds: undefined }];
    state.sessionPendingResolutions[SESSION_ID] = [
      {
        id: 'pending',
        sessionId: SESSION_ID,
        threadId: 'PRRT_1',
        prNumber: 12,
        commitSha: 'old-sha',
        reply: null,
        outcome: 'resolved',
        replyPostedAt: null,
        createdAt: NOW,
      },
    ];
    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });
    expect(state.queueResolution).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ threadId: 'PRRT_1', commitSha: 'abcdef1234567890' }),
    );
    expect(state.resolverState[AGENT_ID]).toBe('committed');
    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toMatchObject({ kind: 'resolved' });
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

    const outcome = state.resolverThreadOutcomes[AGENT_ID]?.PRRT_1;
    expect(outcome).toEqual({ kind: 'analyzed', reply: summary, verdict: 'wontfix' });
    expect(buildResolutionReplyBody(outcome, null)).toBe(summary);
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

    expect(state.resolverState[AGENT_ID]).toBe('awaiting');
    expect(Object.keys(state.resolverThreadOutcomes[AGENT_ID] ?? {})).toEqual(['PRRT_1', 'PRRT_2']);
    expect(state.activateNextResolver).toHaveBeenCalledWith(SESSION_ID);
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

    expect(state.resolverState[AGENT_ID]).toBe('committed');
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

    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toEqual({
      kind: 'resolved',
      commitSha: 'abcdef1234567890',
    });
    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_2).toEqual({
      kind: 'analyzed',
      reply: 'already covered',
      verdict: 'wontfix',
    });
    expect(state.resolverState[AGENT_ID]).toBe('committed');
  });

  it('requeues an amended sha for a thread that is already in the push batch', async () => {
    const { state, set, get, actions } = createHarness({});
    const oldSha = 'aaaaaaaaaaaaaaaa';
    const newSha = 'bbbbbbbbbbbbbbbb';
    const queued = {
      id: 'pending-1',
      sessionId: SESSION_ID,
      prNumber: 7,
      threadId: 'PRRT_1',
      commitSha: oldSha,
      reply: 'fixed it',
      outcome: 'resolved',
      replyPostedAt: null,
      createdAt: NOW,
    } satisfies PendingResolution;
    await actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: `<<comment-resolved threadId="PRRT_1" commitSha="${oldSha}">>`,
    });
    state.sessionPendingResolutions = { [SESSION_ID]: [queued] };
    state.queueResolution.mockImplementationOnce(async (_sessionId, args) => {
      state.sessionPendingResolutions = {
        [SESSION_ID]: [{ ...queued, commitSha: args.commitSha }],
      };
    });

    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: `<<comment-resolved threadId="PRRT_1" commitSha="${newSha}">>`,
      now: () => NOW,
    });

    expect(state.queueResolution).toHaveBeenCalledWith(SESSION_ID, {
      threadId: 'PRRT_1',
      commitSha: newSha,
      prNumber: queued.prNumber,
      reply: queued.reply,
      outcome: 'resolved',
    });
    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toMatchObject({ commitSha: newSha });
    expect(state.sessionPendingResolutions[SESSION_ID]).toHaveLength(1);
    expect(state.sessionPendingResolutions[SESSION_ID]?.[0]?.commitSha).toBe(newSha);
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

    expect(state.resolverState[AGENT_ID]).toBe('committed');
    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toEqual({
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
  it('leaves another resolver thread and its queued commit untouched', async () => {
    const { state, set, get } = createHarness({});
    state.sessionPendingResolutions = {
      [SESSION_ID]: [
        {
          id: 'other',
          sessionId: SESSION_ID,
          prNumber: 7,
          threadId: 'PRRT_OTHER',
          commitSha: 'original',
          reply: 'Original draft',
          outcome: 'resolved',
          replyPostedAt: null,
          createdAt: NOW,
        },
      ],
    };
    await completeResolvedAgent({
      set,
      get,
      sessionId: SESSION_ID,
      resolvedAgentId: AGENT_ID,
      assistantText: '<<comment-resolved threadId="PRRT_OTHER" commitSha="abcdef1234567890">>',
      now: () => NOW,
    });
    expect(state.queueResolution).not.toHaveBeenCalled();
    expect(state.resolverThreadOutcomes[AGENT_ID]?.PRRT_OTHER).toBeUndefined();
  });
});
