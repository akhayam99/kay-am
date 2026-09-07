import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentId, IsoDateTime, SessionId } from '@goodboy/types';
import type { GetFn, SetFn } from './types';
import { activateNextResolver } from './activateNextResolver';

const SID = 'sess-1' as SessionId;
const FIRST = 'resolver-1' as AgentId;
const SECOND = 'resolver-2' as AgentId;

const resolver = (over: Partial<Agent> & { id: AgentId }): Agent => ({
  sessionId: SID,
  ordinal: 0,
  name: 'resolve: reviewer on a.ts:1',
  status: 'pending',
  kind: 'resolver',
  ...over,
});

const makeStore = ({
  agents,
  pendingResolverKickoff,
}: {
  readonly agents: ReadonlyArray<Agent>;
  readonly pendingResolverKickoff: Record<string, string>;
}) => {
  const sendTurn = vi.fn(async () => undefined);
  const selectAgent = vi.fn(async () => undefined);
  const state: Record<string, unknown> = {
    recordResolvePhase: vi.fn(async () => undefined),
    sessionPhaseRuns: { [SID]: agents },
    agentKindOverride: {},
    pendingResolverKickoff,
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

describe('activateNextResolver', () => {
  it('starts the lowest ordinal queued resolver in place, without selecting it', async () => {
    const { state, get, set, sendTurn, selectAgent } = makeStore({
      agents: [resolver({ id: SECOND, ordinal: 2 }), resolver({ id: FIRST, ordinal: 1 })],
      pendingResolverKickoff: { [FIRST]: 'fix comment one', [SECOND]: 'fix comment two' },
    });

    await activateNextResolver(set, get)(SID);

    expect(selectAgent).not.toHaveBeenCalled();
    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: FIRST, content: 'fix comment one' }),
    );
    expect((state.pendingResolverKickoff as Record<string, string>)[FIRST]).toBeUndefined();
  });

  it('keeps one resolver at a time while another is running', async () => {
    const { get, set, sendTurn } = makeStore({
      agents: [
        resolver({ id: FIRST, ordinal: 1, status: 'running' }),
        resolver({ id: SECOND, ordinal: 2 }),
      ],
      pendingResolverKickoff: { [SECOND]: 'fix comment two' },
    });

    await activateNextResolver(set, get)(SID);

    expect(sendTurn).not.toHaveBeenCalled();
  });

  it('skips a queued resolver that has no kickoff waiting', async () => {
    const { get, set, sendTurn } = makeStore({
      agents: [resolver({ id: FIRST, ordinal: 1 })],
      pendingResolverKickoff: {},
    });

    await activateNextResolver(set, get)(SID);

    expect(sendTurn).not.toHaveBeenCalled();
  });

  it('leaves a queued resolver the operator marked done out of the rotation', async () => {
    const { get, set, sendTurn } = makeStore({
      agents: [
        resolver({ id: FIRST, ordinal: 1, doneAt: '2026-08-03T10:00:00.000Z' as IsoDateTime }),
        resolver({ id: SECOND, ordinal: 2 }),
      ],
      pendingResolverKickoff: { [FIRST]: 'fix comment one', [SECOND]: 'fix comment two' },
    });

    await activateNextResolver(set, get)(SID);

    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: SECOND, content: 'fix comment two' }),
    );
  });

  it('does not start a second resolver while the first activation is still landing over ipc', async () => {
    let releaseSendTurn: (() => void) | undefined;
    const sendTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSendTurn = () => resolve();
        }),
    );
    const selectAgent = vi.fn(async () => undefined);
    const state: Record<string, unknown> = {
      recordResolvePhase: vi.fn(async () => undefined),
      sessionPhaseRuns: {
        [SID]: [resolver({ id: FIRST, ordinal: 1 }), resolver({ id: SECOND, ordinal: 2 })],
      },
      agentKindOverride: {},
      pendingResolverKickoff: { [FIRST]: 'fix comment one', [SECOND]: 'fix comment two' },
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

    const activate = activateNextResolver(set, get);
    const first = activate(SID);
    const second = activate(SID);
    await Promise.all([first, second]);

    expect(sendTurn).toHaveBeenCalledOnce();
    expect(sendTurn).toHaveBeenCalledWith(expect.objectContaining({ agentId: FIRST }));

    releaseSendTurn?.();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('lets the chain hand off to the next resolver from inside the finishing turn', async () => {
    const started: AgentId[] = [];
    const state: Record<string, unknown> = {
      recordResolvePhase: vi.fn(async () => undefined),
      sessionPhaseRuns: {
        [SID]: [resolver({ id: FIRST, ordinal: 1 }), resolver({ id: SECOND, ordinal: 2 })],
      },
      agentKindOverride: {},
      pendingResolverKickoff: { [FIRST]: 'fix comment one', [SECOND]: 'fix comment two' },
    };
    const get = (() => state) as unknown as GetFn;
    const set = ((u: unknown) => {
      const patch =
        typeof u === 'function'
          ? (u as (s: Record<string, unknown>) => Record<string, unknown>)(state)
          : (u as Record<string, unknown>);
      Object.assign(state, patch);
    }) as unknown as SetFn;

    const sendTurn = vi.fn(async ({ agentId }: { agentId: AgentId }) => {
      started.push(agentId);
      const setStatus = (status: Agent['status']) => {
        const runs = (state.sessionPhaseRuns as Record<string, ReadonlyArray<Agent>>)[SID] ?? [];
        state.sessionPhaseRuns = {
          ...(state.sessionPhaseRuns as Record<string, ReadonlyArray<Agent>>),
          [SID]: runs.map((agent) => (agent.id === agentId ? { ...agent, status } : agent)),
        };
      };
      setStatus('running');
      await Promise.resolve();
      setStatus('completed');
      if (agentId === FIRST) {
        await activateNextResolver(set, get)(SID);
      }
    });
    state.sendTurn = sendTurn;
    state.selectAgent = vi.fn(async () => undefined);

    await activateNextResolver(set, get)(SID);
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual([FIRST, SECOND]);
  });

  it('ignores a force closed resolver when picking the next one', async () => {
    const { get, set, sendTurn } = makeStore({
      agents: [
        resolver({ id: FIRST, ordinal: 1, status: 'skipped' }),
        resolver({ id: SECOND, ordinal: 2 }),
      ],
      pendingResolverKickoff: { [SECOND]: 'fix comment two' },
    });

    await activateNextResolver(set, get)(SID);

    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: SECOND, content: 'fix comment two' }),
    );
  });

  it('surfaces a notification instead of an unhandled rejection when the kickoff turn fails', async () => {
    const sendTurn = vi.fn(async () => {
      throw new Error('provider unreachable');
    });
    const emitNotification = vi.fn(async () => undefined);
    const state: Record<string, unknown> = {
      recordResolvePhase: vi.fn(async () => undefined),
      sessionPhaseRuns: { [SID]: [resolver({ id: FIRST, ordinal: 1 })] },
      agentKindOverride: {},
      pendingResolverKickoff: { [FIRST]: 'fix comment one' },
      sendTurn,
      selectAgent: vi.fn(async () => undefined),
      emitNotification,
    };
    const get = (() => state) as unknown as GetFn;
    const set = ((u: unknown) => {
      const patch =
        typeof u === 'function'
          ? (u as (s: Record<string, unknown>) => Record<string, unknown>)(state)
          : (u as Record<string, unknown>);
      Object.assign(state, patch);
    }) as unknown as SetFn;

    await activateNextResolver(set, get)(SID);
    await Promise.resolve();
    await Promise.resolve();

    expect(emitNotification).toHaveBeenCalledWith(
      'error',
      'error',
      'resolver failed to start',
      'provider unreachable',
      { sessionId: SID },
    );
  });
});
