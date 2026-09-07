import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  OverrideSettings,
  PendingResolution,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import type { GetFn, SetFn } from './types';

type GhRun = (
  args: ReadonlyArray<string>,
  opts?: Readonly<Record<string, unknown>>,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const h = vi.hoisted(() => ({
  rows: [] as PendingResolution[],
  run: vi.fn<GhRun>(),
}));

vi.mock('@goodboy/db', () => ({
  listPendingResolutionsForSession: vi.fn(async ({ sessionId }: { sessionId: SessionId }) =>
    h.rows.filter((r) => r.sessionId === sessionId),
  ),
  queuePendingResolution: vi.fn(async (params: Record<string, unknown>) => {
    h.rows.push({
      id: params.id as string,
      sessionId: params.sessionId as SessionId,
      prNumber: params.prNumber as number,
      threadId: params.threadId as string,
      commitSha: params.commitSha as string,
      reply: params.reply as string | null,
      outcome: params.outcome as PendingResolution['outcome'],
      replyPostedAt: null,
      createdAt: NOW,
    });
  }),
  deletePendingResolution: vi.fn(
    async ({ sessionId, threadId }: { sessionId: SessionId; threadId: string }) => {
      h.rows = h.rows.filter((r) => !(r.sessionId === sessionId && r.threadId === threadId));
    },
  ),
  markPendingResolutionReplyPosted: vi.fn(async () => undefined),
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../features/github/github', () => ({ tauriGhRunner: { run: h.run } }));

import { resolveAgentThreads } from './resolveAgentThreads';

const NOW = '2026-08-05T00:00:00.000Z' as IsoDateTime;
const SESSION_ID = 'sess-1' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const AGENT_ID = 'agent-1' as AgentId;
const THREAD_OK = 'PRRT_ok';
const THREAD_FAIL = 'PRRT_fail';

const agent: Agent = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'resolver',
  kind: 'resolver',
  status: 'completed',
  sourceThreadIds: [THREAD_OK, THREAD_FAIL],
};

const resolveThreadResponse = (threadId: string): string =>
  JSON.stringify({ data: { resolveReviewThread: { thread: { id: threadId, isResolved: true } } } });
const resolveThreadFailed = JSON.stringify({ errors: [{ message: 'graphql boom' }] });

type State = {
  sessionResolveThreads: Record<string, ReadonlyArray<never>>;
  updateResolveThread: ReturnType<typeof vi.fn>;
  sessions: ReadonlyArray<{ id: SessionId; workspaceId: WorkspaceId }>;
  workspaces: ReadonlyArray<{ id: WorkspaceId }>;
  workspaceOverrides: Record<string, OverrideSettings>;
  sessionGithub: Record<string, { pr: { number: number } | null; detail?: { comments: [] } }>;
  sessionResolvedThreads: Record<string, ReadonlyArray<string>>;
  sessionPhaseRuns: Record<string, ReadonlyArray<Agent>>;
  resolverThreadOutcomes: Record<string, Record<string, unknown>>;
  sessionPendingResolutions: Record<string, ReadonlyArray<PendingResolution>>;
  sessionProjectMounts: Record<string, ReadonlyArray<unknown>>;
  sessionActiveProject: Record<string, string>;
  sessionWorktrees: Record<string, ReadonlyArray<string>>;
  sessionBranches: Record<string, string>;
  emitNotification: ReturnType<typeof vi.fn>;
  refreshSessionPrDetail: ReturnType<typeof vi.fn>;
};

const makeStore = () => {
  const state: State = {
    sessionResolveThreads: {},
    updateResolveThread: vi.fn(async () => true),
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }],
    workspaces: [{ id: WORKSPACE_ID }],
    workspaceOverrides: {},
    sessionGithub: { [SESSION_ID]: { pr: { number: 42 } } },
    sessionResolvedThreads: {},
    sessionPhaseRuns: { [SESSION_ID]: [agent] },
    resolverThreadOutcomes: {
      [AGENT_ID]: {
        [THREAD_OK]: { kind: 'wontfix', reason: 'skip', reply: null },
        [THREAD_FAIL]: { kind: 'wontfix', reason: 'skip', reply: null },
      },
    },
    sessionPendingResolutions: {},
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionWorktrees: {},
    sessionBranches: {},
    emitNotification: vi.fn(async () => undefined),
    refreshSessionPrDetail: vi.fn(async () => undefined),
  };
  const get = (() => state) as unknown as GetFn;
  const set = ((update: unknown) => {
    const patch =
      typeof update === 'function'
        ? (update as (s: State) => Partial<State>)(state)
        : (update as Partial<State>);
    Object.assign(state, patch);
  }) as unknown as SetFn;
  return { state, get, set };
};

const addReplyOk = JSON.stringify({
  data: { addPullRequestReviewThreadReply: { comment: { id: 'c1', url: 'https://x' } } },
});

const defaultRunMock = async (args: ReadonlyArray<string>) => {
  const joined = args.join(' ');
  if (joined.includes('addPullRequestReviewThreadReply')) {
    return { stdout: addReplyOk, stderr: '', exitCode: 0 };
  }
  if (joined.includes(`threadId=${THREAD_FAIL}`)) {
    return { stdout: resolveThreadFailed, stderr: '', exitCode: 0 };
  }
  return { stdout: resolveThreadResponse(THREAD_OK), stderr: '', exitCode: 0 };
};

beforeEach(() => {
  h.rows = [];
  h.run.mockReset();
  h.run.mockImplementation(defaultRunMock);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveAgentThreads, write-ahead pending queue', () => {
  it('deletes the row for a thread that closes on github but retains the row for one that fails', async () => {
    const { get, set } = makeStore();

    const ok = await resolveAgentThreads(set, get)(SESSION_ID, AGENT_ID);

    expect(ok).toBe(false);
    const remaining = h.rows.map((r) => r.threadId);
    expect(remaining).toEqual([THREAD_FAIL]);
  });

  it('writes a thread row before its resolve mutation reaches github, so a mid-flight crash leaves it queued', async () => {
    const { get, set } = makeStore();
    let queuedAtFirstMutation: ReadonlyArray<string> = [];
    h.run.mockImplementation(async (args) => {
      const joined = args.join(' ');
      if (joined.includes('resolveReviewThread') && queuedAtFirstMutation.length === 0) {
        queuedAtFirstMutation = h.rows.map((r) => r.threadId);
      }
      return defaultRunMock(args);
    });

    await resolveAgentThreads(set, get)(SESSION_ID, AGENT_ID);

    expect(queuedAtFirstMutation).toContain(THREAD_OK);
  });
});
