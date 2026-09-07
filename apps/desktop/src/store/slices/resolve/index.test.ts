import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  hasResolveImport,
  insertMessage,
  listResolveThreads,
  migrate,
  upsertResolveThread,
  type Database,
} from '@goodboy/db';
import type { Agent, AgentId, IsoDateTime, MessageId, SessionId } from '@goodboy/types';
import { resolverMissingVerdicts } from '../../../features/session/resolverMissingVerdicts';
import { resolverThreadSettlements } from '../../../features/session/resolverThreadSettlements';
import { resolverStatus } from '../../../features/workspace/components/WorkspacesSidebar/lib';
import type { GetFn, SetFn } from './types';
import { createResolveSlice } from './index';
import { resolveInitialState } from './state';
import { createResolveThread } from './createResolveThread';

const h = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  exec: vi.fn(),
  listLiveRunIds: vi.fn(async () => new Set<string>()),
}));
vi.mock('../../../features/chat/turn', () => ({ listLiveRunIds: h.listLiveRunIds }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: h }));

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;
const NOW = '2026-08-05T00:00:00.000Z' as IsoDateTime;
const agent: Agent = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'resolver',
  kind: 'resolver',
  status: 'completed',
  sourceThreadIds: ['PRRT_1', 'PRRT_2'],
  sourceCommentUrl: 'https://github.com/example/repo/pull/12#discussion_r1',
};
const ASSISTANT_TEXT =
  '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">> <<comment-wontfix threadId="PRRT_2" reason="intentional">>';
let db: Database;

const createHarness = () => {
  const initial = {
    ...resolveInitialState,
    sessionPhaseRuns: { [SESSION_ID]: [agent] },
    agentKindOverride: {},
    resolverState: {},
    resolverThreadOutcomes: {},
    sessionResolvedThreads: {},
    sessionActiveProject: {},
    sessionGithub: {},
  };
  const store = createStore(() => initial);
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  const actions = createResolveSlice({ set, get });
  return { store, get, actions };
};

type MessageParams = { readonly content: string; readonly createdAt?: IsoDateTime };
const persistMessage = async ({ content, createdAt = NOW }: MessageParams) =>
  insertMessage(db, {
    id: crypto.randomUUID() as MessageId,
    sessionId: SESSION_ID,
    agentId: AGENT_ID,
    role: 'assistant',
    content,
    createdAt,
  });

type StatusParams = { readonly get: GetFn };
const statusFor = ({ get }: StatusParams) =>
  resolverStatus(
    agent,
    new Set(get().sessionResolvedThreads[SESSION_ID] ?? []),
    new Set(),
    get().resolverState[AGENT_ID],
  );
const missingVerdictsFor = ({ get }: StatusParams) =>
  resolverMissingVerdicts({
    settlements: resolverThreadSettlements({
      threadIds: ['PRRT_1', 'PRRT_2'],
      outcomes: get().resolverThreadOutcomes[AGENT_ID] ?? {},
      pendingResolutions: [],
      closedThreadIds: new Set<string>(),
    }),
    status: 'done',
    isBusy: false,
  });

beforeEach(async () => {
  h.listLiveRunIds.mockReset().mockResolvedValue(new Set());
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  db = {
    exec: async (sql) => {
      sqlite.exec(sql);
    },
    execute: async (sql, params = []) => ({
      rowsAffected: Number(
        sqlite.prepare(sql).run(...(params as ReadonlyArray<import('node:sqlite').SQLInputValue>))
          .changes,
      ),
    }),
    select: async <T>(sql: string, params: ReadonlyArray<unknown> = []) =>
      sqlite
        .prepare(sql)
        .all(
          ...(params as ReadonlyArray<import('node:sqlite').SQLInputValue>),
        ) as unknown as ReadonlyArray<T>,
  };
  h.exec.mockReset().mockImplementation(db.exec);
  h.execute.mockReset().mockImplementation(db.execute);
  h.select.mockReset().mockImplementation(db.select);
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session-1', 'workspace', 'Goal', 'idle', 1, 1)",
  );
  await db.execute(
    "INSERT INTO agents (id, session_id, ordinal, name, status) VALUES ('agent-1', 'session-1', 0, 'resolver', 'completed')",
  );
});

describe('durable resolve store', () => {
  it('leaves a completed legacy resolver without evidence at done', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(live.get().resolverState[AGENT_ID]).toBeUndefined();
    expect(statusFor({ get: live.get })).toBe('done');
  });

  it('preserves a database outcome when queuing through an empty projection', async () => {
    const live = createHarness();
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
    });
    const rebooted = createHarness();
    await rebooted.actions.updateResolveThread({
      sessionId: SESSION_ID,
      threadId: 'PRRT_1',
      initialPatch: { state: 'needs_answer', disposition: null },
      patch: { replyDraft: 'Edited reply' },
    });
    expect(
      rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
    ).toMatchObject({ state: 'fixed', disposition: 'fix', replyDraft: 'Edited reply' });
    await rebooted.actions.updateResolveThread({
      sessionId: SESSION_ID,
      threadId: 'new-thread',
      initialPatch: { state: 'answered', disposition: 'reply' },
      patch: {},
    });
    expect(
      rebooted
        .get()
        .sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'new-thread'),
    ).toMatchObject({ state: 'answered', disposition: 'reply' });
  });

  it('applies a GitHub observation batch from one database snapshot and projects once', async () => {
    const live = createHarness();
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
    });
    const rebooted = createHarness();
    const observer = vi.fn();
    rebooted.store.subscribe(observer);
    h.select.mockClear();
    await rebooted.actions.updateResolveThreads({
      sessionId: SESSION_ID,
      updates: ({ rows }) =>
        rows.map((row) => ({
          threadId: row.threadId,
          patch: { state: 'closed', githubResolved: true, closedSource: 'github' },
        })),
    });
    expect(rebooted.get().sessionResolvedThreads[SESSION_ID]).toEqual(
      expect.arrayContaining(['PRRT_1', 'PRRT_2']),
    );
    expect(
      h.select.mock.calls.filter(([sql]) => String(sql).includes('FROM resolve_threads')),
    ).toHaveLength(1);
    expect(observer).toHaveBeenCalledOnce();
  });

  it.each([
    {
      marker: '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">>',
      state: 'fixed',
      reason: null,
    },
    {
      marker: '<<comment-wontfix threadId="PRRT_1" reason="intentional">>',
      state: 'answered',
      reason: 'wontfix:intentional',
    },
    {
      marker: '<<comment-analysis threadId="PRRT_1" verdict="fix" summary="Add a guard">>',
      state: 'needs_answer',
      reason: 'proposed_fix',
    },
    { marker: 'No marker survived.', state: 'failed', reason: 'interrupted' },
  ])(
    'recovers an interrupted candidate as $state after the import is already stamped',
    async ({ marker, state, reason }) => {
      const live = createHarness();
      await live.actions.loadResolveSession({ sessionId: SESSION_ID });
      const attemptId = await live.actions.recordResolveAttempt({
        sessionId: SESSION_ID,
        agent,
        provider: 'anthropic',
        model: 'recorded-model',
        effort: null,
        instructions: null,
        phase: 'running',
      });
      await live.actions.persistResolveTurn({
        sessionId: SESSION_ID,
        agent,
        assistantText: ASSISTANT_TEXT,
        isCandidate: true,
        attemptId,
      });
      await db.execute('UPDATE resolve_attempts SET started_at = 1 WHERE id = ?', [attemptId]);
      await persistMessage({ content: marker });
      const rebooted = createHarness();
      await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
      expect(
        rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
      ).toMatchObject({ state, stateReason: reason });
      expect(await hasResolveImport({ db, sessionId: SESSION_ID, version: 1 })).toBe(true);
      h.select.mockClear();
      await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
      expect(h.select.mock.calls.some(([sql]) => String(sql).includes('FROM messages'))).toBe(
        false,
      );
    },
  );

  it('does not use an older transcript to complete an interrupted retry', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await persistMessage({ content: ASSISTANT_TEXT });
    const attemptId = await live.actions.recordResolveAttempt({
      sessionId: SESSION_ID,
      agent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: null,
      instructions: null,
      phase: 'running',
    });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
      isCandidate: true,
      attemptId,
    });
    await db.execute('UPDATE resolve_attempts SET started_at = ? WHERE id = ?', [
      Date.parse(NOW) + 1,
      attemptId,
    ]);
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      rebooted
        .get()
        .sessionResolveThreads[SESSION_ID]?.every(
          (row) => row.state === 'failed' && row.stateReason === 'interrupted',
        ),
    ).toBe(true);
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]).toEqual({});
  });

  it('keeps candidates working while their provider process is alive', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    const runningAgent = { ...agent, runId: 'live-run' as import('@goodboy/types').ProviderRunId };
    live.store.setState({ sessionPhaseRuns: { [SESSION_ID]: [runningAgent] } });
    const attemptId = await live.actions.recordResolveAttempt({
      sessionId: SESSION_ID,
      agent: runningAgent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: null,
      instructions: null,
      phase: 'running',
    });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent: runningAgent,
      assistantText: ASSISTANT_TEXT,
      isCandidate: true,
      attemptId,
    });
    h.listLiveRunIds.mockResolvedValue(new Set(['live-run']));
    h.select.mockClear();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      live.get().sessionResolveThreads[SESSION_ID]?.every((row) => row.state === 'working'),
    ).toBe(true);
    expect(h.select.mock.calls.some(([sql]) => String(sql).includes('FROM messages'))).toBe(false);
  });

  it('brings back the verdicts and the same ResolverStatus after restart without reading messages', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
    });
    const beforeRestart = live.get().resolverThreadOutcomes[AGENT_ID];
    expect(beforeRestart).toEqual({
      PRRT_1: { kind: 'resolved', commitSha: 'abcdef1234567890' },
      PRRT_2: { kind: 'wontfix', reason: 'intentional' },
    });
    const beforeStatus = statusFor({ get: live.get });
    const rebooted = createHarness();
    h.select.mockClear();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]).toEqual(beforeRestart);
    expect(statusFor({ get: rebooted.get })).toBe(beforeStatus);
    expect(h.select.mock.calls.some(([sql]) => String(sql).includes('FROM messages'))).toBe(false);
  });

  it('stops the silence notice from accusing a resolver that did report', async () => {
    await persistMessage({ content: ASSISTANT_TEXT });
    const rebooted = createHarness();
    expect(missingVerdictsFor({ get: rebooted.get })?.threadIds).toEqual(['PRRT_1', 'PRRT_2']);
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(missingVerdictsFor({ get: rebooted.get })).toBeNull();
    expect(await hasResolveImport({ db, sessionId: SESSION_ID, version: 1 })).toBe(true);
  });

  it('names only the thread left without a verdict and ignores unowned markers', async () => {
    await persistMessage({
      content:
        '<<comment-resolved threadId="PRRT_1" commitSha="abcdef1234567890">> <<comment-wontfix threadId="unowned" reason="ignore">>',
    });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(missingVerdictsFor({ get: rebooted.get })?.threadIds).toEqual(['PRRT_2']);
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]?.unowned).toBeUndefined();
    expect(await listResolveThreads({ db, sessionId: SESSION_ID })).toHaveLength(2);
  });

  it('keeps newer saved outcomes over transcript history on later loads', async () => {
    await persistMessage({ content: ASSISTANT_TEXT });
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await live.actions.updateResolveThread({
      sessionId: SESSION_ID,
      threadId: 'PRRT_1',
      patch: {
        state: 'needs_answer',
        disposition: 'reply',
        stateReason: 'review_legacy_result',
        commitShas: null,
        replyDraft: 'newer',
      },
    });
    h.select.mockClear();
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toEqual({
      kind: 'analyzed',
      reply: 'newer',
    });
    expect(h.select.mock.calls.some(([sql]) => String(sql).includes('FROM messages'))).toBe(false);
  });

  it('does not stamp completion after a transcript read fails and retries on the next load', async () => {
    await persistMessage({ content: ASSISTANT_TEXT });
    h.select.mockImplementation(async (sql: string, params: ReadonlyArray<unknown>) => {
      if (sql.includes('FROM messages')) {
        throw new Error('read interrupted');
      }
      return db.select(sql, params);
    });
    const live = createHarness();
    await expect(live.actions.loadResolveSession({ sessionId: SESSION_ID })).rejects.toThrow(
      'read interrupted',
    );
    expect(await hasResolveImport({ db, sessionId: SESSION_ID, version: 1 })).toBe(false);
    h.select.mockImplementation(db.select);
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(await hasResolveImport({ db, sessionId: SESSION_ID, version: 1 })).toBe(true);
  });

  it('persists an analysis fix as a candidate and promotes it to a proposed change', async () => {
    const live = createHarness();
    const attemptId = await live.actions.recordResolveAttempt({
      sessionId: SESSION_ID,
      agent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: 'high',
      instructions: 'Fix the comments',
      phase: 'running',
    });
    const assistantText =
      '<<comment-analysis threadId="PRRT_1" verdict="fix" summary="Add a guard">>';
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText,
      isCandidate: true,
      attemptId,
    });
    expect(
      (await listResolveThreads({ db, sessionId: SESSION_ID })).find(
        (row) => row.threadId === 'PRRT_1',
      ),
    ).toMatchObject({ state: 'working', replyDraft: 'Add a guard' });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText,
      attemptId,
    });
    expect(
      (await listResolveThreads({ db, sessionId: SESSION_ID })).find(
        (row) => row.threadId === 'PRRT_1',
      ),
    ).toMatchObject({ state: 'needs_answer', stateReason: 'proposed_fix' });
    expect(live.get().resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toMatchObject({
      kind: 'analyzed',
      verdict: 'fix',
    });
  });

  it('keeps pending-row edits and posted receipts during legacy import', async () => {
    const row = createResolveThread({ sessionId: SESSION_ID, threadId: 'PRRT_1', prNumber: 12 });
    await upsertResolveThread({
      db,
      row: {
        ...row,
        state: 'fixed',
        disposition: 'fix',
        replyDraft: 'Human reply',
        commitShas: ['human-sha'],
        replyPostedAt: 42,
      },
      expectedRevision: null,
    });
    await db.execute(
      "INSERT INTO pending_resolutions (id, session_id, pr_number, thread_id, commit_sha, reply, outcome, reply_posted_at, created_at) VALUES ('pending', 'session-1', 12, 'PRRT_1', 'human-sha', 'Human reply', 'resolved', 42, 1)",
    );
    await persistMessage({ content: ASSISTANT_TEXT });
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      live.get().sessionResolveThreads[SESSION_ID]?.find((item) => item.threadId === 'PRRT_1'),
    ).toMatchObject({ replyDraft: 'Human reply', commitShas: ['human-sha'], replyPostedAt: 42 });
  });

  it('rejects stale user updates and survives agent deletion with closure receipts intact', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    const revision = live
      .get()
      .sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1')?.revision;
    await live.actions.updateResolveThread({
      sessionId: SESSION_ID,
      threadId: 'PRRT_1',
      patch: {
        state: 'closed',
        githubResolved: true,
        closedAt: 20,
        closedSource: 'goodboy',
        replyId: 'reply-id',
        replyPostedAt: 10,
      },
    });
    expect(
      await live.actions.updateResolveThread({
        sessionId: SESSION_ID,
        threadId: 'PRRT_1',
        revision,
        patch: { state: 'working' },
      }),
    ).toBe(false);
    await db.execute("DELETE FROM agents WHERE id = 'agent-1'");
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
    ).toMatchObject({ state: 'closed', replyId: 'reply-id', replyPostedAt: 10, closedAt: 20 });
    expect(statusFor({ get: rebooted.get })).toBe('done');
  });
  it('keeps a reply-only candidate attached to its analysis verdict through completion and restart', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText:
        '<<comment-analysis threadId="PRRT_1" verdict="wontfix" summary="Already guarded">>',
    });
    const attemptId = await live.actions.recordResolveAttempt({
      sessionId: SESSION_ID,
      agent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: null,
      instructions: 'Reword the reply',
      phase: 'running',
    });
    const assistantText =
      '<<comment-reply id="PRRT_1">>The guard already handles this.<</comment-reply>>';
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText,
      isCandidate: true,
      attemptId,
    });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText,
      attemptId,
    });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
    ).toMatchObject({
      state: 'answered',
      disposition: 'no_change',
      replyDraft: 'The guard already handles this.',
    });
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toEqual({
      kind: 'analyzed',
      reply: 'The guard already handles this.',
    });
  });

  it('rejects a completion from an old attempt after a retry starts', async () => {
    const live = createHarness();
    const params = {
      sessionId: SESSION_ID,
      agent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: null,
      instructions: null,
      phase: 'running',
    } satisfies Parameters<typeof live.actions.recordResolveAttempt>[0];
    const oldAttemptId = await live.actions.recordResolveAttempt(params);
    await live.actions.recordResolvePhase({
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      phase: 'cancelled',
    });
    const newAttemptId = await live.actions.recordResolveAttempt(params);
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
      attemptId: oldAttemptId,
    });
    expect(
      live
        .get()
        .sessionResolveThreads[SESSION_ID]?.every(
          (row) => row.state === 'working' && row.activeAttemptId === newAttemptId,
        ),
    ).toBe(true);
    expect(live.get().resolverThreadOutcomes[AGENT_ID]).toEqual({});
  });

  it('restores stopped status for a legacy resolver without an attempt row', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await live.actions.recordResolvePhase({
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      phase: 'cancelled',
    });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(statusFor({ get: live.get })).toBe('stopped');
    expect(statusFor({ get: rebooted.get })).toBe('stopped');
  });

  it('imports a proposed fix with its verdict and ignores later transcript edits', async () => {
    await persistMessage({
      content: '<<comment-analysis threadId="PRRT_1" verdict="fix" summary="Add a guard">>',
    });
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await persistMessage({ content: ASSISTANT_TEXT });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(
      rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
    ).toMatchObject({ state: 'needs_answer', stateReason: 'proposed_fix' });
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toMatchObject({
      kind: 'analyzed',
      verdict: 'fix',
    });
  });

  it('retains a proposed verdict after a markerless follow-up and restart', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: '<<comment-analysis threadId="PRRT_1" verdict="fix" summary="Add a guard">>',
    });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: 'No additional result.',
    });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(statusFor({ get: rebooted.get })).toBe('awaiting');
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]?.PRRT_1).toEqual({
      kind: 'analyzed',
      verdict: 'fix',
      reply: 'Add a guard',
    });
  });

  it('keeps an interrupted streaming candidate out of the settled outcomes', async () => {
    const live = createHarness();
    await live.actions.loadResolveSession({ sessionId: SESSION_ID });
    const attemptId = await live.actions.recordResolveAttempt({
      sessionId: SESSION_ID,
      agent,
      provider: 'anthropic',
      model: 'recorded-model',
      effort: null,
      instructions: null,
      phase: 'running',
    });
    await live.actions.persistResolveTurn({
      sessionId: SESSION_ID,
      agent,
      assistantText: ASSISTANT_TEXT,
      attemptId,
      isCandidate: true,
    });
    await live.actions.recordResolvePhase({
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
      attemptId,
      phase: 'cancelled',
    });
    const rebooted = createHarness();
    await rebooted.actions.loadResolveSession({ sessionId: SESSION_ID });
    expect(statusFor({ get: rebooted.get })).toBe('stopped');
    expect(rebooted.get().resolverThreadOutcomes[AGENT_ID]).toEqual({});
    expect(
      rebooted.get().sessionResolveThreads[SESSION_ID]?.find((row) => row.threadId === 'PRRT_1'),
    ).toMatchObject({ commitShas: ['abcdef1234567890'] });
  });
});
