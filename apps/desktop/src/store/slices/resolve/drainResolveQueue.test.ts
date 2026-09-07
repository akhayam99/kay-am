import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { migrate, upsertResolveThread, type Database } from '@goodboy/db';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type { Agent, AgentId, IsoDateTime, ProjectId, SessionId } from '@goodboy/types';
import type { GetFn, SetFn } from './types';
import type { SendTurnResult } from '../turn/types';
import { createResolveSlice } from './index';
import { createResolveThread } from './createResolveThread';
import { selectDirtyTreeThreads, withDirtyTreeReason } from './selectDirtyTreeThreads';
import { resolveInitialState } from './state';

type Lease = {
  readonly path: string;
  readonly holder: string | null;
  readonly token: string | null;
  readonly runId: string | null;
  readonly isGranted: boolean;
  readonly hasExited: boolean;
  readonly waiting: ReadonlyArray<string>;
};

type Slot = {
  holder: string | null;
  token: string | null;
  runId: string | null;
  grantedAt: number;
  hasExited: boolean;
  waiters: string[];
};

type PathParams = { readonly path: string };
type HolderParams = PathParams & { readonly holder: string };
type StatusParams = PathParams & { readonly isGranted: boolean };
type BindParams = LeaseParams & { readonly runId: string };

type LeaseParams = {
  readonly path: string;
  readonly holder: string;
  readonly token: string | null;
};

const h = vi.hoisted(() => {
  const slots = new Map<string, Slot>();
  const clientTokens = new Map<string, string>();
  const state = { seq: 0, now: 0 };
  const slotFor = ({ path }: PathParams): Slot => {
    const existing = slots.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const fresh: Slot = {
      holder: null,
      token: null,
      runId: null,
      grantedAt: state.now,
      hasExited: false,
      waiters: [],
    };
    slots.set(path, fresh);
    return fresh;
  };
  const statusOf = ({ path, isGranted }: StatusParams): Lease => {
    const slot = slots.get(path);
    return {
      path,
      holder: slot?.holder ?? null,
      token: isGranted ? (slot?.token ?? null) : null,
      runId: slot?.runId ?? null,
      isGranted,
      hasExited: slot?.hasExited ?? false,
      waiting: [...(slot?.waiters ?? [])],
    };
  };
  const acquire = ({ path, holder, token }: LeaseParams): Lease => {
    const slot = slotFor({ path });
    const isSameId = slot.holder === holder;
    const isStealable = slot.runId === null && state.now - slot.grantedAt >= 120_000;
    const isFree =
      slot.holder === null ||
      slot.hasExited ||
      isStealable ||
      (isSameId && token !== null && token === slot.token);
    const isNext = slot.waiters[0] === undefined || slot.waiters[0] === holder;
    if (isFree && isNext) {
      slot.waiters = slot.waiters.filter((waiting) => waiting !== holder);
      if (!isSameId || slot.hasExited || isStealable) {
        state.seq += 1;
        slot.token = `token-${state.seq}`;
        slot.holder = holder;
        slot.hasExited = false;
        slot.runId = null;
        slot.grantedAt = state.now;
      }
      return statusOf({ path, isGranted: true });
    }
    if (!isSameId && !slot.waiters.includes(holder)) {
      slot.waiters.push(holder);
    }
    return statusOf({ path, isGranted: false });
  };
  const drop = ({ path }: PathParams): void => {
    const slot = slots.get(path);
    if (slot !== undefined && slot.holder === null && slot.waiters.length === 0) {
      slots.delete(path);
    }
  };
  const release = ({ path, holder, token }: LeaseParams): Lease => {
    const slot = slots.get(path);
    if (slot === undefined) {
      return statusOf({ path, isGranted: false });
    }
    slot.waiters = slot.waiters.filter((waiting) => waiting !== holder);
    if (slot.holder === holder && token !== null && token === slot.token) {
      slot.holder = null;
      slot.token = null;
      slot.runId = null;
      slot.hasExited = false;
    }
    drop({ path });
    return statusOf({ path, isGranted: false });
  };
  const cancel = ({ path, holder }: HolderParams): Lease => {
    const slot = slots.get(path);
    if (slot === undefined) {
      return statusOf({ path, isGranted: false });
    }
    slot.waiters = slot.waiters.filter((waiting) => waiting !== holder);
    drop({ path });
    return statusOf({ path, isGranted: false });
  };
  const abandon = ({ path, holder }: HolderParams): Lease => {
    const slot = slots.get(path);
    if (slot === undefined) {
      return statusOf({ path, isGranted: false });
    }
    slot.waiters = slot.waiters.filter((waiting) => waiting !== holder);
    if (slot.holder === holder) {
      slot.holder = null;
      slot.token = null;
      slot.runId = null;
      slot.hasExited = false;
    }
    drop({ path });
    return statusOf({ path, isGranted: false });
  };
  const bindRun = ({ path, holder, token, runId }: BindParams): (() => void) => {
    const slot = slots.get(path);
    if (
      slot === undefined ||
      slot.holder !== holder ||
      token === null ||
      slot.token !== token ||
      slot.hasExited ||
      slot.runId !== null
    ) {
      throw new Error('worktree writer lease is not owned by this turn');
    }
    slot.runId = runId;
    return () => {
      const current = slots.get(path);
      if (current !== undefined && current.holder === holder && current.token === token) {
        current.hasExited = true;
      }
    };
  };
  const key = ({ path, holder }: HolderParams) => `${path} ${holder}`;
  return {
    execute: vi.fn(),
    select: vi.fn(),
    exec: vi.fn(),
    listLiveRunIds: vi.fn(async () => new Set<string>()),
    agentList: vi.fn(async () => [] as ReadonlyArray<Agent>),
    slots,
    clientTokens,
    state,
    acquire,
    bindRun,
    release,
    cancel,
    abandon,
    key,
    statusOf,
    status: {
      branch: 'goodboy/rt',
      head: null,
      headSubject: null,
      upstreamDistance: { kind: 'unknown', reason: 'no-upstream' },
      mainDistance: { kind: 'unknown', reason: 'no-upstream' },
      workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
      upstream: null,
      inProgress: null,
    },
  };
});

vi.mock('../../../features/chat/turn', () => ({ listLiveRunIds: h.listLiveRunIds }));
vi.mock('../../../features/workflows/workflows', () => ({ invokeAgentList: h.agentList }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: h }));
vi.mock('../../../features/worktree/worktree', () => ({
  acquireWorktreeWriter: vi.fn(async ({ path, holder }: HolderParams) => {
    const cacheKey = h.key({ path, holder });
    const lease = h.acquire({ path, holder, token: h.clientTokens.get(cacheKey) ?? null });
    if (lease.isGranted && lease.token !== null) {
      h.clientTokens.set(cacheKey, lease.token);
    } else {
      h.clientTokens.delete(cacheKey);
    }
    return lease;
  }),
  releaseWorktreeWriter: vi.fn(async ({ path, holder }: HolderParams) => {
    const cacheKey = h.key({ path, holder });
    const token = h.clientTokens.get(cacheKey);
    if (token === undefined) {
      return h.statusOf({ path, isGranted: false });
    }
    h.clientTokens.delete(cacheKey);
    return h.release({ path, holder, token });
  }),
  cancelWorktreeWriter: vi.fn(async ({ path, holder }: HolderParams) => {
    h.clientTokens.delete(h.key({ path, holder }));
    return h.cancel({ path, holder });
  }),
  abandonWorktreeWriter: vi.fn(async ({ path, holder }: HolderParams) => {
    h.clientTokens.delete(h.key({ path, holder }));
    return h.abandon({ path, holder });
  }),
  holdsWorktreeWriter: vi.fn(
    ({ path, holder }: HolderParams) => h.clientTokens.get(h.key({ path, holder })) !== undefined,
  ),
  worktreeWriterStatus: vi.fn(async ({ path }: PathParams) =>
    h.statusOf({ path, isGranted: false }),
  ),
  worktreeStatus: vi.fn(async () => h.status),
}));

const SESSION_A = 'session-1' as SessionId;
const SESSION_B = 'session-2' as SessionId;
const AGENT_1 = 'agent-1' as AgentId;
const AGENT_2 = 'agent-2' as AgentId;
const AGENT_3 = 'agent-3' as AgentId;
const PROJECT_ID = 'project-1' as ProjectId;
const SHARED_PATH = '/repo/one';

const resolver = ({
  id,
  sessionId,
  ...over
}: { readonly id: AgentId; readonly sessionId: SessionId } & Partial<Agent>) =>
  ({
    id,
    sessionId,
    ordinal: 0,
    name: 'resolver',
    kind: 'resolver',
    status: 'pending',
    ...over,
  }) as Agent;

let db: Database;

type SendParams = {
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly content: string;
};

type HarnessParams = {
  readonly worktreePathBySession?: Readonly<Record<string, string | null>>;
  readonly unopenedSessions?: ReadonlyArray<SessionId>;
};

const createHarness = ({
  worktreePathBySession = {},
  unopenedSessions = [],
}: HarnessParams = {}) => {
  const sendTurn = vi.fn(
    ({ sessionId, agentId }: SendParams): Promise<SendTurnResult | undefined> => {
      const path = worktreePathBySession[sessionId];
      if (path != null) {
        h.bindRun({
          path,
          holder: agentId,
          token: h.clientTokens.get(h.key({ path, holder: agentId })) ?? null,
          runId: `run-${agentId}`,
        });
      }
      return new Promise(() => undefined);
    },
  );
  const emitNotification = vi.fn(async () => undefined);
  const mounts: Record<string, ReadonlyArray<unknown>> = {};
  for (const [sessionId, path] of Object.entries(worktreePathBySession)) {
    mounts[sessionId] =
      path === null
        ? []
        : [{ projectId: PROJECT_ID, mountName: 'repo', worktreePath: path, repoRoot: path }];
  }
  const runs: Record<string, ReadonlyArray<Agent>> = {
    [SESSION_A]: [
      resolver({ id: AGENT_1, sessionId: SESSION_A }),
      resolver({ id: AGENT_2, sessionId: SESSION_A }),
    ],
    [SESSION_B]: [resolver({ id: AGENT_3, sessionId: SESSION_B })],
  };
  for (const sessionId of unopenedSessions) {
    delete runs[sessionId];
  }
  const store = createStore(() => ({
    ...resolveInitialState,
    sessionPhaseRuns: runs,
    sessionProjectMounts: mounts,
    sessionActiveProject: { [SESSION_A]: PROJECT_ID, [SESSION_B]: PROJECT_ID },
    sessions: [],
    agentTurnState: {},
    agentKindOverride: {},
    agentRunHistory: {},
    resolverState: {},
    resolverThreadOutcomes: {},
    sessionResolvedThreads: {},
    sessionGithub: {},
    sendTurn,
    emitNotification,
  }));
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  const actions = createResolveSlice({ set, get });
  store.setState(actions as unknown as Partial<ReturnType<typeof store.getState>>);
  return { store, get, actions, sendTurn, emitNotification };
};

type QueueParams = {
  readonly actions: ReturnType<typeof createHarness>['actions'];
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly instructions: string;
};

const queueRequest = async ({ actions, sessionId, agentId, instructions }: QueueParams) =>
  actions.recordResolveAttempt({
    sessionId,
    agent: resolver({ id: agentId, sessionId }),
    provider: 'anthropic',
    model: 'claude-opus-5',
    effort: null,
    instructions,
    phase: 'queued',
  });

const setTree = ({ unstaged }: { readonly unstaged: number }) => {
  h.status = {
    ...h.status,
    workingTree: { ...h.status.workingTree, unstaged, changed: unstaged },
  };
};

beforeEach(async () => {
  h.slots.clear();
  h.clientTokens.clear();
  h.state.seq = 0;
  h.state.now = 0;
  setTree({ unstaged: 0 });
  h.status = { ...h.status, inProgress: null };
  h.listLiveRunIds.mockReset().mockResolvedValue(new Set());
  h.agentList.mockReset().mockResolvedValue([]);
  db = makeTestDatabase();
  h.exec.mockReset().mockImplementation(db.exec);
  h.execute.mockReset().mockImplementation(db.execute);
  h.select.mockReset().mockImplementation(db.select);
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  for (const sessionId of [SESSION_A, SESSION_B]) {
    await db.execute(
      'INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, 'workspace', 'Goal', 'idle', 1, 1],
    );
  }
});

describe('resolve queue scheduler', () => {
  it('refuses a delayed spawn after the unbound lease is stolen', () => {
    const first = h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    h.state.now = 119_999;
    expect(h.acquire({ path: SHARED_PATH, holder: AGENT_2, token: null }).isGranted).toBe(false);
    h.state.now = 120_000;
    const stolen = h.acquire({ path: SHARED_PATH, holder: AGENT_2, token: null });
    expect(stolen.isGranted).toBe(true);
    expect(() =>
      h.bindRun({ path: SHARED_PATH, holder: AGENT_1, token: first.token, runId: 'old-run' }),
    ).toThrow('lease is not owned');
    h.bindRun({ path: SHARED_PATH, holder: AGENT_2, token: stolen.token, runId: 'new-run' });
    h.state.now += 240_000;
    expect(h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: first.token }).isGranted).toBe(
      false,
    );
  });

  it('keeps an orphaned run exit from making a reclaimed same id lease stealable', () => {
    const first = h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    const exitOld = h.bindRun({
      path: SHARED_PATH,
      holder: AGENT_1,
      token: first.token,
      runId: 'old-run',
    });
    h.abandon({ path: SHARED_PATH, holder: AGENT_1 });
    const reclaimed = h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    expect(() =>
      h.bindRun({ path: SHARED_PATH, holder: AGENT_1, token: first.token, runId: 'stale-run' }),
    ).toThrow('lease is not owned');
    const exitNew = h.bindRun({
      path: SHARED_PATH,
      holder: AGENT_1,
      token: reclaimed.token,
      runId: 'new-run',
    });
    exitOld();
    h.state.now += 240_000;
    expect(h.statusOf({ path: SHARED_PATH, isGranted: false })).toMatchObject({
      hasExited: false,
      runId: 'new-run',
    });
    expect(h.acquire({ path: SHARED_PATH, holder: AGENT_2, token: null }).isGranted).toBe(false);
    exitNew();
    expect(h.acquire({ path: SHARED_PATH, holder: AGENT_2, token: null }).isGranted).toBe(true);
  });

  it('recovers a reload between acquisition and spawn without wedging the next request', async () => {
    const first = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await first.actions.recordResolveAttempt({
      sessionId: SESSION_A,
      agent: resolver({ id: AGENT_1, sessionId: SESSION_A }),
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'lost setup',
      phase: 'running',
    });
    await queueRequest({
      actions: first.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    h.clientTokens.clear();
    const reloaded = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await reloaded.actions.reconcileResolveDrains();
    expect(
      reloaded
        .get()
        .sessionResolveAttempts[SESSION_A]?.find((attempt) => attempt.agentId === AGENT_1)?.phase,
    ).toBe('failed');
    expect(reloaded.sendTurn).not.toHaveBeenCalled();
    h.state.now = 120_000;
    await reloaded.actions.reconcileResolveDrains();
    expect(reloaded.sendTurn).toHaveBeenCalledOnce();
    expect(h.statusOf({ path: SHARED_PATH, isGranted: false })).toMatchObject({
      holder: AGENT_2,
      runId: `run-${AGENT_2}`,
    });
  });

  it('waits for reconciliation after sendTurn is denied instead of immediately draining again', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.sendTurn.mockImplementationOnce(async () => {
      await queueRequest({
        actions: harness.actions,
        sessionId: SESSION_A,
        agentId: AGENT_1,
        instructions: 'fix one',
      });
      return { blockedOverBudget: false, isWriterLeaseDenied: true };
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await vi.waitFor(() => expect(h.slots.size).toBe(0));
    expect(harness.sendTurn).toHaveBeenCalledOnce();
    expect(harness.get().sessionResolveAttempts[SESSION_A]?.[0]?.phase).toBe('queued');
    await harness.actions.reconcileResolveDrains();
    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
  });

  it('starts one request when two surfaces ask at the same moment', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await Promise.all([
      harness.actions.drainResolveQueue({ sessionId: SESSION_A }),
      harness.actions.drainResolveQueue({ sessionId: SESSION_A }),
    ]);

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix one');
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_1);
    const attempts = harness.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.filter((attempt) => attempt.phase === 'queued')).toHaveLength(1);
  });

  it('holds the next resolver back while the finished one still holds the writer lease', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    const endedAttemptId = await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.recordResolvePhase({
      sessionId: SESSION_A,
      agentId: AGENT_1,
      attemptId: endedAttemptId,
      phase: 'finished',
    });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.drainResolveWorktree({ worktreePath: SHARED_PATH });

    expect(harness.sendTurn).toHaveBeenCalledOnce();
    expect(harness.sendTurn.mock.calls[0]?.[0]?.agentId).toBe(AGENT_1);
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_1);
    const attempts = harness.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.find((attempt) => attempt.agentId === AGENT_2)?.phase).toBe('queued');
  });

  it('hands the worktree to the next resolver once the finished one gives the lease back', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    const endedAttemptId = await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.recordResolvePhase({
      sessionId: SESSION_A,
      agentId: AGENT_1,
      attemptId: endedAttemptId,
      phase: 'finished',
    });
    h.abandon({ path: SHARED_PATH, holder: AGENT_1 });
    await harness.actions.drainResolveWorktree({ worktreePath: SHARED_PATH });

    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
    expect(harness.sendTurn.mock.calls[1]?.[0]?.agentId).toBe(AGENT_2);
  });

  it('refuses a second window that never saw the token of the granted lease', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).not.toHaveBeenCalled();
    const attempts = harness.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts[0]?.phase).toBe('queued');
  });

  it('keeps two sessions sharing a worktree from writing at once', async () => {
    const harness = createHarness({
      worktreePathBySession: { [SESSION_A]: SHARED_PATH, [SESSION_B]: SHARED_PATH },
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_B,
      agentId: AGENT_3,
      instructions: 'fix three',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_B });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_1);

    await harness.actions.recordResolvePhase({
      sessionId: SESSION_A,
      agentId: AGENT_1,
      phase: 'finished',
    });
    h.abandon({ path: SHARED_PATH, holder: AGENT_1 });
    await harness.actions.drainResolveWorktree({ worktreePath: SHARED_PATH });

    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
    expect(harness.sendTurn.mock.calls[1]?.[0]?.content).toBe('fix three');
  });

  it('drops a waiter with no queued attempt instead of letting it wedge the worktree', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    h.acquire({ path: SHARED_PATH, holder: 'ghost-holder', token: null });
    h.acquire({ path: SHARED_PATH, holder: 'ghost-waiter', token: null });
    h.abandon({ path: SHARED_PATH, holder: 'ghost-holder' });
    expect(h.slots.get(SHARED_PATH)?.waiters).toEqual(['ghost-waiter']);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_1);
  });

  it('drops the wait of a parked agent that would otherwise block every other acquire', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.store.setState({
      sessionPhaseRuns: {
        [SESSION_A]: [
          resolver({
            id: AGENT_1,
            sessionId: SESSION_A,
            doneAt: '2026-08-03T10:00:00.000Z' as IsoDateTime,
          }),
          resolver({ id: AGENT_2, sessionId: SESSION_A, ordinal: 1 }),
        ],
      },
    } as never);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    h.acquire({ path: SHARED_PATH, holder: 'other-holder', token: null });
    h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    h.abandon({ path: SHARED_PATH, holder: 'other-holder' });
    expect(h.slots.get(SHARED_PATH)?.waiters).toEqual([AGENT_1]);

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix two');
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_2);
  });

  it('runs distinct worktrees independently', async () => {
    const harness = createHarness({
      worktreePathBySession: { [SESSION_A]: SHARED_PATH, [SESSION_B]: '/repo/two' },
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_B,
      agentId: AGENT_3,
      instructions: 'fix three',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_B });

    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_1);
    expect(h.slots.get('/repo/two')?.holder).toBe(AGENT_3);
  });

  it('skips the drain when the session has no worktree mount yet', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: null } });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).not.toHaveBeenCalled();
    expect(h.slots.size).toBe(0);
  });

  it('releases the lease and starts the next request when a turn fails to start', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.sendTurn.mockRejectedValueOnce(new Error('provider missing'));
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await vi.waitFor(() => expect(harness.sendTurn).toHaveBeenCalledTimes(2));

    expect(harness.sendTurn.mock.calls[1]?.[0]?.content).toBe('fix two');
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_2);
    expect(harness.emitNotification).toHaveBeenCalled();
    const attempts = harness.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.find((attempt) => attempt.agentId === AGENT_1)?.phase).toBe('failed');
  });

  it('fails a request whose turn returned without ever starting and moves on', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.sendTurn.mockResolvedValueOnce(undefined);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await vi.waitFor(() => expect(harness.sendTurn).toHaveBeenCalledTimes(2));

    const attempts = harness.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.find((attempt) => attempt.agentId === AGENT_1)).toMatchObject({
      phase: 'failed',
      error: 'the turn ended before the resolver started',
    });
    expect(harness.sendTurn.mock.calls[1]?.[0]?.content).toBe('fix two');
    expect(h.slots.get(SHARED_PATH)?.holder).toBe(AGENT_2);
  });

  it('reports a request the budget cap turned away instead of leaving it running', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.sendTurn.mockResolvedValueOnce({
      blockedOverBudget: true,
    } as unknown as undefined);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await vi.waitFor(() =>
      expect((harness.get().sessionResolveAttempts[SESSION_A] ?? [])[0]?.phase).toBe('failed'),
    );

    expect((harness.get().sessionResolveAttempts[SESSION_A] ?? [])[0]?.error).toBe(
      'every provider is over its budget cap',
    );
    expect(h.slots.size).toBe(0);
  });

  it('holds the queue when the finished run left the worktree dirty and resumes once it is clean', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    const endedAttemptId = await harness.actions.recordResolveAttempt({
      sessionId: SESSION_A,
      agent: { ...resolver({ id: AGENT_1, sessionId: SESSION_A }), sourceThreadIds: ['PRRT_1'] },
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'fix one',
      phase: 'queued',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    await harness.actions.recordResolvePhase({
      sessionId: SESSION_A,
      agentId: AGENT_1,
      attemptId: endedAttemptId,
      phase: 'finished',
    });
    h.abandon({ path: SHARED_PATH, holder: AGENT_1 });
    setTree({ unstaged: 2 });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A, endedAttemptId });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(
      selectDirtyTreeThreads({
        sessionResolveThreads: harness.get().sessionResolveThreads,
        sessionId: SESSION_A,
      }),
    ).toEqual(['PRRT_1']);

    setTree({ unstaged: 0 });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
    expect(harness.sendTurn.mock.calls[1]?.[0]?.content).toBe('fix two');
  });

  it('ignores edits the tree already carried before the attempt started', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    setTree({ unstaged: 2 });
    const endedAttemptId = await harness.actions.recordResolveAttempt({
      sessionId: SESSION_A,
      agent: { ...resolver({ id: AGENT_1, sessionId: SESSION_A }), sourceThreadIds: ['PRRT_1'] },
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'fix one',
      phase: 'queued',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });
    await harness.actions.recordResolvePhase({
      sessionId: SESSION_A,
      agentId: AGENT_1,
      attemptId: endedAttemptId,
      phase: 'finished',
    });
    h.abandon({ path: SHARED_PATH, holder: AGENT_1 });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A, endedAttemptId });

    expect(
      selectDirtyTreeThreads({
        sessionResolveThreads: harness.get().sessionResolveThreads,
        sessionId: SESSION_A,
      }),
    ).toEqual([]);
    expect(harness.sendTurn).toHaveBeenCalledTimes(2);
    expect(harness.sendTurn.mock.calls[1]?.[0]?.content).toBe('fix two');
  });

  it('keeps a persisted dirty block after a reload wiped the in-memory baseline', async () => {
    const RELOAD_PATH = '/repo/reload';
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: RELOAD_PATH } });
    const dirtyRow = createResolveThread({
      sessionId: SESSION_A,
      threadId: 'PRRT_1',
      projectId: PROJECT_ID,
    });
    await upsertResolveThread({
      db,
      row: { ...dirtyRow, stateReason: withDirtyTreeReason({ row: dirtyRow }) },
      expectedRevision: null,
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    setTree({ unstaged: 2 });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(
      selectDirtyTreeThreads({
        sessionResolveThreads: harness.get().sessionResolveThreads,
        sessionId: SESSION_A,
      }),
    ).toEqual(['PRRT_1']);
    expect(harness.sendTurn).not.toHaveBeenCalled();
  });

  it('fails an interrupted running attempt on load and resumes the waiting one', async () => {
    const first = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await first.actions.recordResolveAttempt({
      sessionId: SESSION_A,
      agent: { ...resolver({ id: AGENT_1, sessionId: SESSION_A }), sourceThreadIds: ['PRRT_1'] },
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'fix one',
      phase: 'running',
    });
    await queueRequest({
      actions: first.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    const rebooted = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_A });

    const attempts = rebooted.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.find((attempt) => attempt.agentId === AGENT_1)?.phase).toBe('failed');
    expect(rebooted.sendTurn).toHaveBeenCalledTimes(1);
    expect(rebooted.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix two');
  });

  it('leaves a running attempt alone while another window still holds the writer lease', async () => {
    const first = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await first.actions.recordResolveAttempt({
      sessionId: SESSION_A,
      agent: { ...resolver({ id: AGENT_1, sessionId: SESSION_A }), sourceThreadIds: ['PRRT_1'] },
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'fix one',
      phase: 'running',
    });
    await queueRequest({
      actions: first.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });
    const lease = h.acquire({ path: SHARED_PATH, holder: AGENT_1, token: null });
    h.bindRun({ path: SHARED_PATH, holder: AGENT_1, token: lease.token, runId: 'live-run' });
    h.state.now += 240_000;

    const other = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    h.clientTokens.clear();
    await other.actions.loadResolveSession({ sessionId: SESSION_A });

    const attempts = other.get().sessionResolveAttempts[SESSION_A] ?? [];
    expect(attempts.find((attempt) => attempt.agentId === AGENT_1)?.phase).toBe('running');
    expect(other.sendTurn).not.toHaveBeenCalled();
  });

  it('drops a request whose agent is gone instead of blocking the queue', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: 'agent-deleted' as AgentId,
      instructions: 'fix deleted',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix one');
  });

  it('leaves a queued resolver the operator marked done out of the rotation', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    harness.store.setState({
      sessionPhaseRuns: {
        [SESSION_A]: [
          resolver({
            id: AGENT_1,
            sessionId: SESSION_A,
            doneAt: '2026-08-03T10:00:00.000Z' as IsoDateTime,
          }),
          resolver({ id: AGENT_2, sessionId: SESSION_A, ordinal: 1 }),
        ],
      },
    } as never);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_2,
      instructions: 'fix two',
    });

    await harness.actions.drainResolveQueue({ sessionId: SESSION_A });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix two');
  });

  it('starts a queued request for a session the operator never opened', async () => {
    const harness = createHarness({
      worktreePathBySession: { [SESSION_A]: SHARED_PATH, [SESSION_B]: SHARED_PATH },
      unopenedSessions: [SESSION_B],
    });
    h.agentList.mockResolvedValue([resolver({ id: AGENT_3, sessionId: SESSION_B })]);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_B,
      agentId: AGENT_3,
      instructions: 'fix three',
    });

    await harness.actions.drainResolveWorktree({ worktreePath: SHARED_PATH });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix three');
  });

  it('starts a queued request for a session outside the loaded workspace', async () => {
    const harness = createHarness({
      worktreePathBySession: { [SESSION_A]: SHARED_PATH },
      unopenedSessions: [SESSION_B],
    });
    await db.execute(
      'INSERT INTO session_worktrees (id, session_id, worktree_path, branch, parallel_index, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['worktree-b', SESSION_B, SHARED_PATH, 'goodboy/b', 0, 1],
    );
    h.agentList.mockResolvedValue([resolver({ id: AGENT_3, sessionId: SESSION_B })]);
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_B,
      agentId: AGENT_3,
      instructions: 'fix three',
    });

    await harness.actions.drainResolveWorktree({ worktreePath: SHARED_PATH });

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix three');
  });

  it('fails a stale running attempt of a session nobody opened on the periodic pass', async () => {
    const harness = createHarness({
      worktreePathBySession: { [SESSION_A]: SHARED_PATH, [SESSION_B]: SHARED_PATH },
      unopenedSessions: [SESSION_B],
    });
    h.agentList.mockResolvedValue([resolver({ id: AGENT_3, sessionId: SESSION_B })]);
    await harness.actions.recordResolveAttempt({
      sessionId: SESSION_B,
      agent: { ...resolver({ id: AGENT_3, sessionId: SESSION_B }), sourceThreadIds: ['PRRT_3'] },
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'fix three',
      phase: 'running',
    });

    await harness.actions.reconcileResolveDrains();

    const attempts = harness.get().sessionResolveAttempts[SESSION_B] ?? [];
    expect(attempts[0]?.phase).toBe('failed');
    expect(attempts[0]?.error).toBe('interrupted');
  });

  it('picks the queue back up on reconciliation when no lease event arrived', async () => {
    const harness = createHarness({ worktreePathBySession: { [SESSION_A]: SHARED_PATH } });
    await queueRequest({
      actions: harness.actions,
      sessionId: SESSION_A,
      agentId: AGENT_1,
      instructions: 'fix one',
    });

    await harness.actions.reconcileResolveDrains();

    expect(harness.sendTurn).toHaveBeenCalledTimes(1);
    expect(harness.sendTurn.mock.calls[0]?.[0]?.content).toBe('fix one');
  });
});
