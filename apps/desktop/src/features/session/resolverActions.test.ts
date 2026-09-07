import { describe, expect, it } from 'vitest';
import type { Agent, AgentId, SessionId } from '@goodboy/types';
import {
  resolverActionOpensPanel,
  resolverActionPlan,
  type ResolverActionSurface,
} from './resolverActions';
import { resolverThreadTally } from './resolverThreadTally';
import type { ResolverThreadSettlement } from './resolverThreadSettlements';

const SESSION_ID = 'session-1' as SessionId;

const agentWith = (overrides: Partial<Agent> = {}): Agent =>
  ({
    id: 'agent-1' as AgentId,
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'resolver',
    status: 'completed',
    sourceThreadId: 'PRRT_1',
    ...overrides,
  }) as Agent;

const settlement = (
  threadId: string,
  kind: ResolverThreadSettlement['kind'],
): ResolverThreadSettlement => ({
  threadId,
  kind,
  commitSha: kind === 'resolved' ? 'abc1234' : null,
  reason: kind === 'wontfix' ? 'intentional' : null,
  reply: null,
  isQueued: false,
  isClosed: false,
});

const tallyOf = (...kinds: ReadonlyArray<ResolverThreadSettlement['kind']>) =>
  resolverThreadTally({
    settlements: kinds.map((kind, index) => settlement(`PRRT_${index + 1}`, kind)),
  });

const base = {
  agent: agentWith(),
  turnState: undefined,
  commitSha: 'abc1234',
  tally: tallyOf('resolved'),
  surface: 'inspector' as ResolverActionSurface,
  queuedThreadIds: [] as ReadonlyArray<string>,
  prNumber: 7,
  hasOtherActiveResolvers: false,
};

describe('resolverActionPlan', () => {
  it('pushes and resolves when it is the last resolver standing', () => {
    const plan = resolverActionPlan({ ...base, status: 'committed' });

    expect(plan.primary?.label).toBe('Push & resolve');
    expect(plan.secondary?.label).toBe('Add to push batch');
    expect(plan.primary?.confirm).not.toBeNull();
  });

  it('prefers the batch while other resolvers are still active', () => {
    const plan = resolverActionPlan({
      ...base,
      status: 'committed',
      hasOtherActiveResolvers: true,
    });

    expect(plan.primary?.label).toBe('Add to push batch');
    expect(plan.primary?.confirm).toBeNull();
    expect(plan.secondary?.label).toBe('Push now');
  });

  it('states the batch membership and leaves only a way out', () => {
    const plan = resolverActionPlan({
      ...base,
      status: 'committed',
      queuedThreadIds: ['PRRT_1'],
    });

    expect(plan.note).toBe('In the push batch');
    expect(plan.primary).toBeNull();
    expect(plan.secondary?.label).toBe('Remove from batch');
  });

  it('keeps push disabled without a commit to push', () => {
    const plan = resolverActionPlan({
      ...base,
      status: 'committed',
      commitSha: null,
      tally: tallyOf('open'),
    });

    expect(plan.primary?.isEnabled).toBe(false);
    expect(plan.secondary?.isEnabled).toBe(false);
    expect(plan.note).toBe('no fix recorded on any thread yet');
  });

  it('enables push from a resolved outcome, never from a sha shared across threads', () => {
    const oneFixed = resolverActionPlan({
      ...base,
      status: 'committed',
      commitSha: null,
      tally: tallyOf('resolved', 'resolved'),
    });
    const noneFixed = resolverActionPlan({
      ...base,
      status: 'committed',
      commitSha: 'abc1234',
      tally: tallyOf('wontfix', 'wontfix'),
    });

    expect(oneFixed.primary?.isEnabled).toBe(true);
    expect(noneFixed.primary?.isEnabled).toBe(false);
  });

  it('sends a lane card without a fix to the inspector to be explained', () => {
    const wontfix = resolverActionPlan({
      ...base,
      status: 'wontfix',
      surface: 'lane',
      tally: tallyOf('wontfix'),
    });

    expect(wontfix.primary?.label).toBe('Post explanation & close');
    expect(wontfix.primary?.opensInspector).toBe(true);
    expect(wontfix.secondary).toBeNull();
  });

  it('closes threads in bulk from the inspector only when there are several', () => {
    const one = resolverActionPlan({ ...base, status: 'wontfix', tally: tallyOf('wontfix') });
    const analyzed = resolverActionPlan({
      ...base,
      status: 'analyzed',
      tally: tallyOf('analyzed'),
    });
    const many = resolverActionPlan({
      ...base,
      status: 'analyzed',
      tally: tallyOf('analyzed', 'analyzed'),
    });

    expect(one.primary).toBeNull();
    expect(analyzed.primary?.label).toBe('Proceed with fix');
    expect(analyzed.secondary).toBeNull();
    expect(many.secondary?.label).toBe('Post & close all');
  });

  it('sends a lane card of disagreeing threads to the inspector instead of one CTA', () => {
    const lane = resolverActionPlan({
      ...base,
      status: 'committed',
      surface: 'lane',
      tally: tallyOf('resolved', 'resolved', 'open'),
    });

    expect(lane.primary?.label).toBe('Review threads');
    expect(resolverActionOpensPanel({ action: lane.primary! })).toBe(true);
    expect(lane.secondary).toBeNull();
  });

  it('counts the settled threads in the inspector block and names what is left open', () => {
    const inspector = resolverActionPlan({
      ...base,
      status: 'committed',
      tally: tallyOf('resolved', 'wontfix', 'open'),
    });

    expect(inspector.primary?.label).toBe('Push & resolve 2');
    expect(inspector.secondary?.label).toBe('Add 1 to batch');
    expect(inspector.note).toBe('1 thread still needs you');
  });

  it('counts a thread github already closed out of the push and the batch', () => {
    const inspector = resolverActionPlan({
      ...base,
      status: 'committed',
      tally: resolverThreadTally({
        settlements: [
          { ...settlement('PRRT_1', 'resolved'), isClosed: true },
          settlement('PRRT_2', 'resolved'),
          { ...settlement('PRRT_3', 'open'), isClosed: true },
          settlement('PRRT_4', 'open'),
        ],
      }),
    });

    expect(inspector.primary?.label).toBe('Push & resolve 1');
    expect(inspector.secondary?.label).toBe('Add 1 to batch');
    expect(inspector.note).toBe('1 thread still needs you');
  });

  it('offers no push when every fix it recorded is already closed', () => {
    const inspector = resolverActionPlan({
      ...base,
      status: 'committed',
      tally: resolverThreadTally({
        settlements: [
          { ...settlement('PRRT_1', 'resolved'), isClosed: true },
          settlement('PRRT_2', 'open'),
        ],
      }),
    });

    expect(inspector.primary).toBeNull();
    expect(inspector.secondary).toBeNull();
    expect(inspector.note).toBe('1 thread still needs you');
  });

  it('sends an action needing typed input to the panel', () => {
    const wontfix = resolverActionPlan({ ...base, status: 'wontfix', surface: 'lane' });
    const committed = resolverActionPlan({ ...base, status: 'committed' });

    expect(resolverActionOpensPanel({ action: wontfix.primary! })).toBe(true);
    expect(resolverActionOpensPanel({ action: committed.primary! })).toBe(false);
  });

  it('offers no forward action while working or once resolved', () => {
    const working = resolverActionPlan({
      ...base,
      agent: agentWith({ status: 'running' }),
      status: 'running',
    });
    const resolved = resolverActionPlan({ ...base, status: 'resolved' });

    expect(working.primary).toBeNull();
    expect(working.secondary).toBeNull();
    expect(working.overflow.map((action) => action.kind)).toEqual(['forceClose']);
    expect(resolved.primary).toBeNull();
    expect(resolved.overflow).toEqual([]);
  });

  it('never offers a manual start for a queued resolver', () => {
    const queued = resolverActionPlan({ ...base, status: 'pending' });
    expect(queued.primary).toBeNull();
    expect(queued.note).not.toBeNull();
  });

  it('offers a rerun on a dead end, and leaves a single thread to its own card', () => {
    const failed = resolverActionPlan({ ...base, status: 'failed' });
    const onLane = resolverActionPlan({ ...base, status: 'failed', surface: 'lane' });
    const done = resolverActionPlan({ ...base, status: 'done' });

    expect(failed.primary?.label).toBe('Run again');
    expect(failed.secondary).toBeNull();
    expect(failed.overflow).toEqual([]);
    expect(onLane.secondary?.label).toBe('Mark resolved');
    expect(done.primary?.label).toBe('Run again');
  });

  it('keeps a bulk resolve in the overflow only while several threads await an answer', () => {
    const one = resolverActionPlan({ ...base, status: 'awaiting' });
    const many = resolverActionPlan({
      ...base,
      status: 'awaiting',
      agent: agentWith({ sourceThreadId: undefined, sourceThreadIds: ['PRRT_1', 'PRRT_2'] }),
      tally: tallyOf('open', 'open'),
    });
    const busy = resolverActionPlan({
      ...base,
      status: 'awaiting',
      turnState: { kind: 'running' } as never,
    });

    expect(one.primary?.label).toBe('Answer in chat');
    expect(one.overflow).toEqual([]);
    expect(many.overflow.map((action) => action.label)).toEqual(['Mark all resolved']);
    expect(busy.overflow).toEqual([]);
  });

  it('never offers a manual resolve without a thread to resolve', () => {
    const plan = resolverActionPlan({
      ...base,
      agent: agentWith({ sourceThreadId: undefined }),
      status: 'done',
    });

    expect(plan.secondary).toBeNull();
    expect(plan.overflow).toEqual([]);
  });

  it('withholds the GitHub cluster from a resolver born of a local diff note', () => {
    const localAgent = agentWith({ sourceThreadId: undefined, sourceKind: 'diff_comment' });
    const committed = resolverActionPlan({
      ...base,
      agent: localAgent,
      status: 'committed',
      tally: tallyOf(),
    });
    const wontfix = resolverActionPlan({
      ...base,
      agent: localAgent,
      status: 'wontfix',
      tally: tallyOf(),
    });

    expect(committed.primary).toBeNull();
    expect(committed.secondary).toBeNull();
    expect(committed.note).toBeNull();
    expect(wontfix.primary).toBeNull();
    expect(wontfix.overflow).toEqual([]);
  });

  it('keeps local affordances that never touch GitHub', () => {
    const localAgent = agentWith({ sourceThreadId: undefined, sourceKind: 'diff_comment' });
    const analyzed = resolverActionPlan({
      ...base,
      agent: localAgent,
      status: 'analyzed',
      tally: tallyOf(),
    });
    const failed = resolverActionPlan({
      ...base,
      agent: localAgent,
      status: 'failed',
      tally: tallyOf(),
    });

    expect(analyzed.primary?.label).toBe('Proceed with fix');
    expect(analyzed.secondary).toBeNull();
    expect(failed.primary?.label).toBe('Run again');
  });

  it('still offers the GitHub cluster to a review-born resolver', () => {
    const plan = resolverActionPlan({
      ...base,
      agent: agentWith({ sourceKind: 'review_comment' }),
      status: 'committed',
    });

    expect(plan.primary?.label).toBe('Push & resolve');
    expect(plan.secondary?.label).toBe('Add to push batch');
  });
});
