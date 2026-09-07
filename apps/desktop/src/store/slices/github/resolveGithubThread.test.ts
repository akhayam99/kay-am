import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  OverrideSettings,
  PendingResolution,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import { createResolveSlice } from '../resolve';
import type { GetFn, SetFn } from './types';

type GhRun = (
  args: ReadonlyArray<string>,
  opts?: Readonly<Record<string, unknown>>,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const h = vi.hoisted(() => ({
  rows: [] as PendingResolution[],
  run: vi.fn<GhRun>(),
}));

vi.mock('@goodboy/db', async () => ({
  ...(await import('../resolve/testing/createResolveQueryMocks')).createResolveQueryMocks(),
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

import { resolveGithubThread } from './resolveGithubThread';

const NOW = '2026-08-05T00:00:00.000Z' as IsoDateTime;
const SESSION_ID = 'sess-1' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const THREAD_ID = 'PRRT_1';

const resolveThreadOk = JSON.stringify({
  data: { resolveReviewThread: { thread: { id: THREAD_ID, isResolved: true } } },
});
const resolveThreadFailed = JSON.stringify({ errors: [{ message: 'graphql boom' }] });

type State = {
  sessionResolveThreads: Record<string, ReadonlyArray<never>>;
  sessionResolveAttempts: Record<string, ReadonlyArray<never>>;
  sessionResolvePublications: Record<string, ReadonlyArray<never>>;
  activePublicationPreview: Record<string, unknown>;
  sessions: ReadonlyArray<{ id: SessionId; workspaceId: WorkspaceId }>;
  workspaces: ReadonlyArray<{ id: WorkspaceId }>;
  workspaceOverrides: Record<string, OverrideSettings>;
  sessionGithub: Record<string, { pr: { number: number } | null }>;
  sessionResolvedThreads: Record<string, ReadonlyArray<string>>;
  resolverThreadOutcomes: Record<string, Record<string, unknown>>;
  resolverState: Record<string, unknown>;
  sessionPhaseRuns: Record<string, ReadonlyArray<unknown>>;
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
    sessionResolveAttempts: {},
    sessionResolvePublications: {},
    activePublicationPreview: {},
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }],
    workspaces: [{ id: WORKSPACE_ID }],
    workspaceOverrides: {},
    sessionGithub: { [SESSION_ID]: { pr: { number: 42 } } },
    sessionResolvedThreads: {},
    resolverThreadOutcomes: {},
    resolverState: {},
    sessionPhaseRuns: {},
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
  Object.assign(state, createResolveSlice({ set, get }));
  return { state, get, set };
};

beforeEach(() => {
  h.rows = [];
  h.run.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveGithubThread, write-ahead pending queue', () => {
  it('queues the pending row before the resolve mutation reaches github', async () => {
    let rowQueuedBeforeMutation = false;
    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('resolveReviewThread')) {
        rowQueuedBeforeMutation = h.rows.some((r) => r.threadId === THREAD_ID);
        return { stdout: resolveThreadOk, stderr: '', exitCode: 0 };
      }
      return { stdout: '{}', stderr: '', exitCode: 0 };
    });
    const { get, set } = makeStore();

    await resolveGithubThread(set, get)(SESSION_ID, THREAD_ID, {});

    expect(rowQueuedBeforeMutation).toBe(true);
  });

  it('deletes the pending row once the thread resolves on github', async () => {
    h.run.mockResolvedValue({ stdout: resolveThreadOk, stderr: '', exitCode: 0 });
    const { get, set } = makeStore();

    const ok = await resolveGithubThread(set, get)(SESSION_ID, THREAD_ID, {});

    expect(ok).toBe(true);
    expect(h.rows).toHaveLength(0);
  });

  it('keeps the pending row queued when the github call fails, so the retry strip can pick it up later', async () => {
    h.run.mockResolvedValue({ stdout: resolveThreadFailed, stderr: '', exitCode: 0 });
    const { get, set } = makeStore();

    const ok = await resolveGithubThread(set, get)(SESSION_ID, THREAD_ID, {});

    expect(ok).toBe(false);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]?.threadId).toBe(THREAD_ID);
  });
});
