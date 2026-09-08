import { describe, expect, it } from 'vitest';
import type {
  ResolvePublication,
  ResolvePublicationThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import { makeTestDatabase } from '../../test-helpers/test-db';
import { migrate } from '../../migrations/runner';
import { migrations } from '../../migrations';
import { listResolveThreads, setResolveThreadState, upsertResolveThread } from '../resolve-thread';
import {
  insertResolveAttempt,
  listActiveResolveAttempts,
  listResolveAttempts,
  setResolveAttemptPhase,
} from '../resolve-attempt';
import { commitResolveImport, hasResolveImport } from '../resolve-import';
import {
  insertResolvePublication,
  listActiveResolvePublications,
  listResolvePublicationThreads,
  listResolvePublicationsForSession,
  setResolvePublicationPhase,
  upsertResolvePublicationThread,
} from '../resolve-publication';

const SESSION = 'session' as SessionId;
const seed = async () => {
  const db = makeTestDatabase();
  await migrate(
    db,
    migrations.filter((migration) => migration.version < 140),
  );
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session', 'workspace', 'Goal', 'idle', 1, 1)",
  );
  return db;
};

const row: ResolveThread = {
  id: 'thread',
  sessionId: SESSION,
  projectId: null,
  prNumber: 12,
  threadId: 'PRRT_1',
  originKind: 'review_comment',
  state: 'fixed',
  stateReason: null,
  revision: 0,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: 'Fixed it',
  commitShas: ['abc1234'],
  question: null,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: 1,
  updatedAt: 1,
};

describe('durable resolve rows', () => {
  it('updates an existing row when the caller did not observe its insertion', async () => {
    const db = await seed();
    await migrate(db);
    await upsertResolveThread({ db, row, expectedRevision: null });
    expect(
      await upsertResolveThread({
        db,
        row: { ...row, replyDraft: 'Racing write' },
        expectedRevision: null,
      }),
    ).toBe(true);
    expect((await listResolveThreads({ db, sessionId: SESSION }))[0]).toMatchObject({
      revision: 1,
      replyDraft: 'Racing write',
    });
  });

  it('derives backfill origins from singular and combined agent ownership', async () => {
    const db = await seed();
    await db.execute(
      `INSERT INTO agents (id, session_id, ordinal, name, status, source_kind, source_thread_id, source_thread_ids) VALUES ('issue', 'session', 0, 'resolver', 'completed', 'issue_comment', 'issue-thread', NULL), ('diff', 'session', 1, 'resolver', 'completed', 'diff_comment', NULL, '["diff-thread"]')`,
    );
    for (const threadId of ['issue-thread', 'diff-thread', 'review-thread']) {
      await db.execute(
        'INSERT INTO pending_resolutions (id, session_id, pr_number, thread_id, commit_sha, created_at) VALUES (?, ?, 12, ?, ?, 1)',
        [threadId, SESSION, threadId, 'abc1234'],
      );
    }
    await migrate(db);
    expect(
      Object.fromEntries(
        (await listResolveThreads({ db, sessionId: SESSION })).map((item) => [
          item.threadId,
          item.originKind,
        ]),
      ),
    ).toEqual({
      'issue-thread': 'issue_comment',
      'diff-thread': 'diff_comment',
      'review-thread': 'review_comment',
    });
  });

  it('preserves an earlier finish time while waiting and clears it on an explicit restart', async () => {
    const db = await seed();
    await migrate(db);
    await db.execute(
      "INSERT INTO resolve_attempts (id, session_id, agent_id, pr_number, thread_ids_json, provider, model, phase, ended_at, created_at) VALUES ('attempt', 'session', 'agent', 12, '[]', 'anthropic', 'recorded-model', 'finished', 42, 1)",
    );
    await setResolveAttemptPhase({ db, id: 'attempt', phase: 'waiting' });
    expect((await listResolveAttempts({ db, sessionId: SESSION }))[0]?.endedAt).toBe(42);
    await setResolveAttemptPhase({ db, id: 'attempt', phase: 'running' });
    expect((await listResolveAttempts({ db, sessionId: SESSION }))[0]?.endedAt).toBeNull();
    await setResolveAttemptPhase({ db, id: 'attempt', phase: 'finished' });
    expect((await listResolveAttempts({ db, sessionId: SESSION }))[0]?.endedAt).not.toBeNull();
    await setResolveAttemptPhase({ db, id: 'attempt', phase: 'queued' });
    expect((await listResolveAttempts({ db, sessionId: SESSION }))[0]?.endedAt).toBeNull();
  });

  it('lists the queued and running attempts of every session, unopened ones included', async () => {
    const db = await seed();
    await migrate(db);
    await db.execute(
      "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('other', 'workspace', 'Goal', 'idle', 1, 1)",
    );
    await db.execute(
      `INSERT INTO resolve_attempts (id, session_id, agent_id, pr_number, thread_ids_json, provider, model, phase, created_at) VALUES
        ('queued-here', 'session', 'agent-1', 12, '[]', 'anthropic', 'recorded-model', 'queued', 1),
        ('running-elsewhere', 'other', 'agent-2', 12, '[]', 'anthropic', 'recorded-model', 'running', 2),
        ('done', 'session', 'agent-3', 12, '[]', 'anthropic', 'recorded-model', 'finished', 3)`,
    );
    expect((await listActiveResolveAttempts({ db })).map((attempt) => attempt.id)).toEqual([
      'queued-here',
      'running-elsewhere',
    ]);
  });

  it('does not roll back unrelated writes when an import fails inside another transaction', async () => {
    const db = await seed();
    await migrate(db);
    await db.exec('BEGIN');
    await db.execute("UPDATE sessions SET goal = 'Unrelated edit' WHERE id = 'session'");
    await expect(
      commitResolveImport({
        db,
        sessionId: SESSION,
        version: 1,
        rows: [{ ...row, sessionId: 'absent' as SessionId }],
      }),
    ).rejects.toThrow();
    await db.exec('COMMIT');
    expect(await db.select("SELECT goal FROM sessions WHERE id = 'session'")).toEqual([
      { goal: 'Unrelated edit' },
    ]);
    expect(await hasResolveImport({ db, sessionId: SESSION, version: 1 })).toBe(false);
  });

  it('upgrades every pending verdict while preserving null outcomes and posted receipts', async () => {
    const db = await seed();
    for (const [index, outcome] of ['resolved', 'wontfix', 'analyzed', null, null].entries()) {
      await db.execute(
        'INSERT INTO pending_resolutions (id, session_id, pr_number, thread_id, commit_sha, reply, outcome, reply_posted_at, created_at) VALUES (?, ?, 12, ?, ?, ?, ?, ?, 1)',
        [
          `pending-${index}`,
          SESSION,
          `thread-${index}`,
          index === 4 ? '' : 'abc1234',
          'edited reply',
          outcome,
          index === 3 ? 1234 : null,
        ],
      );
    }
    await migrate(db);
    const rows = await listResolveThreads({ db, sessionId: SESSION });
    expect(rows.map((item) => item.state)).toEqual([
      'fixed',
      'answered',
      'needs_answer',
      'fixed',
      'needs_answer',
    ]);
    expect(rows.map((item) => item.disposition)).toEqual([
      'fix',
      'no_change',
      'reply',
      'fix',
      null,
    ]);
    expect(rows[3]).toMatchObject({
      replyDraft: 'edited reply',
      replyPostedAt: 1234,
      githubResolved: null,
      closedAt: null,
    });
    expect(rows).toHaveLength(5);
    expect(
      await db.select(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_resolutions'",
      ),
    ).toEqual([]);
  });

  it('rejects a stale state revision without losing the newer draft', async () => {
    const db = await seed();
    await migrate(db);
    await upsertResolveThread({ db, row, expectedRevision: null });
    await upsertResolveThread({
      db,
      row: { ...row, replyDraft: 'Human edit' },
      expectedRevision: 0,
    });
    expect(
      await setResolveThreadState({
        db,
        sessionId: SESSION,
        threadId: row.threadId,
        revision: 0,
        state: 'working',
        stateReason: null,
      }),
    ).toBe(false);
    expect((await listResolveThreads({ db, sessionId: SESSION }))[0]).toMatchObject({
      revision: 1,
      state: 'fixed',
      replyDraft: 'Human edit',
    });
    expect(
      await setResolveThreadState({
        db,
        sessionId: SESSION,
        threadId: row.threadId,
        revision: 1,
        state: 'publishing',
        stateReason: null,
      }),
    ).toBe(true);
  });

  it('retains outcomes and attempt ownership after deleting an agent', async () => {
    const db = await seed();
    await migrate(db);
    await db.execute(
      "INSERT INTO agents (id, session_id, ordinal, name, status) VALUES ('agent', 'session', 0, 'Resolver', 'completed')",
    );
    await insertResolveAttempt({
      db,
      attempt: {
        id: 'attempt',
        sessionId: SESSION,
        agentId: 'agent' as import('@goodboy/types').AgentId,
        prNumber: 12,
        threadIds: [row.threadId],
        provider: 'anthropic',
        model: 'recorded-model',
        effort: null,
        instructions: null,
        phase: 'finished',
        startedAt: 1,
        endedAt: 2,
        error: null,
        createdAt: 1,
      },
    });
    await upsertResolveThread({
      db,
      row: { ...row, activeAttemptId: 'attempt' },
      expectedRevision: null,
    });
    await db.execute("DELETE FROM agents WHERE id = 'agent'");
    expect((await listResolveThreads({ db, sessionId: SESSION }))[0]).toMatchObject({
      replyDraft: 'Fixed it',
      activeAttemptId: 'attempt',
    });
    expect(await listResolveAttempts({ db, sessionId: SESSION })).toHaveLength(1);
    await db.execute("DELETE FROM sessions WHERE id = 'session'");
    expect(await listResolveThreads({ db, sessionId: SESSION })).toEqual([]);
    expect(await listResolveAttempts({ db, sessionId: SESSION })).toEqual([]);
  });

  it('rolls back a failed import without stamping completion', async () => {
    const db = await seed();
    await migrate(db);
    const invalid = { ...row, id: 'invalid', threadId: 'other', sessionId: 'absent' as SessionId };
    await expect(
      commitResolveImport({ db, sessionId: SESSION, version: 1, rows: [row, invalid] }),
    ).rejects.toThrow();
    expect(await hasResolveImport({ db, sessionId: SESSION, version: 1 })).toBe(false);
    expect(await listResolveThreads({ db, sessionId: SESSION })).toEqual([]);
    await commitResolveImport({ db, sessionId: SESSION, version: 1, rows: [row] });
    expect(await hasResolveImport({ db, sessionId: SESSION, version: 1 })).toBe(true);
  });

  it('does not overwrite user edits when an importer retries', async () => {
    const db = await seed();
    await migrate(db);
    await commitResolveImport({ db, sessionId: SESSION, version: 1, rows: [row] });
    await upsertResolveThread({
      db,
      row: { ...row, replyDraft: 'New reply' },
      expectedRevision: 0,
    });
    await commitResolveImport({ db, sessionId: SESSION, version: 1, rows: [row] });
    expect((await listResolveThreads({ db, sessionId: SESSION }))[0]?.replyDraft).toBe('New reply');
  });
});

describe('resolve publications', () => {
  const publication: ResolvePublication = {
    id: 'pub-1',
    sessionId: SESSION,
    repo: 'acme/web',
    prNumber: 248,
    branch: 'feature/retry',
    localHead: 'aaaa111',
    remoteHead: '9f8e7d6',
    commitShas: ['aaaa111', 'bbbb222'],
    requiresPush: true,
    phase: 'previewed',
    pushedHead: null,
    confirmedAt: null,
    completedAt: null,
    error: null,
    createdAt: 10,
  };
  const publicationThread: ResolvePublicationThread = {
    publicationId: 'pub-1',
    threadId: 'PRRT_1',
    revision: 3,
    priorState: 'fixed',
    replyBody: 'Fixed in aaaa111',
    replyPhase: 'pending',
    replyId: null,
    replyPostedAt: null,
    resolvePhase: 'pending',
    resolvedAt: null,
    error: null,
  };

  it('round-trips a publication with its per-thread receipts', async () => {
    const db = await seed();
    await migrate(db);
    await insertResolvePublication({ db, publication });
    await upsertResolvePublicationThread({ db, thread: publicationThread });
    expect(await listResolvePublicationsForSession({ db, sessionId: SESSION })).toEqual([
      publication,
    ]);
    expect(await listResolvePublicationThreads({ db, publicationId: 'pub-1' })).toEqual([
      publicationThread,
    ]);
  });

  it('moves a thread from pending to a posted receipt without losing the frozen body', async () => {
    const db = await seed();
    await migrate(db);
    await insertResolvePublication({ db, publication });
    await upsertResolvePublicationThread({ db, thread: publicationThread });
    await upsertResolvePublicationThread({
      db,
      thread: {
        ...publicationThread,
        replyPhase: 'posted',
        replyId: 'IC_1',
        replyPostedAt: 99,
        resolvePhase: 'resolved',
        resolvedAt: 100,
      },
    });
    const stored = await listResolvePublicationThreads({ db, publicationId: 'pub-1' });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      replyBody: 'Fixed in aaaa111',
      replyPhase: 'posted',
      replyId: 'IC_1',
      resolvePhase: 'resolved',
      resolvedAt: 100,
    });
  });

  it('only counts an in-flight publication of the same pull request as active', async () => {
    const db = await seed();
    await migrate(db);
    await insertResolvePublication({ db, publication });
    expect(
      await listActiveResolvePublications({ db, repo: 'acme/web', prNumber: 248 }),
    ).toHaveLength(0);
    await setResolvePublicationPhase({ db, id: 'pub-1', phase: 'pushing' });
    expect(await listActiveResolvePublications({ db, repo: 'acme/web', prNumber: 248 })).toEqual([
      { ...publication, phase: 'pushing' },
    ]);
    expect(
      await listActiveResolvePublications({ db, repo: 'acme/web', prNumber: 999 }),
    ).toHaveLength(0);
    await setResolvePublicationPhase({ db, id: 'pub-1', phase: 'finished' });
    expect(
      await listActiveResolvePublications({ db, repo: 'acme/web', prNumber: 248 }),
    ).toHaveLength(0);
  });

  it('records the pushed head and stamps completion only on a terminal phase', async () => {
    const db = await seed();
    await migrate(db);
    await insertResolvePublication({ db, publication });
    await setResolvePublicationPhase({
      db,
      id: 'pub-1',
      phase: 'pushed',
      pushedHead: 'aaaa111',
    });
    const midway = (await listResolvePublicationsForSession({ db, sessionId: SESSION }))[0];
    expect(midway?.pushedHead).toBe('aaaa111');
    expect(midway?.completedAt).toBeNull();
    await setResolvePublicationPhase({ db, id: 'pub-1', phase: 'finished' });
    const done = (await listResolvePublicationsForSession({ db, sessionId: SESSION }))[0];
    expect(done?.pushedHead).toBe('aaaa111');
    expect(done?.completedAt).not.toBeNull();
  });

  it('drops publications and their receipts when the session is deleted', async () => {
    const db = await seed();
    await migrate(db);
    await insertResolvePublication({ db, publication });
    await upsertResolvePublicationThread({ db, thread: publicationThread });
    await db.execute('DELETE FROM sessions WHERE id = ?', [SESSION]);
    expect(await listResolvePublicationsForSession({ db, sessionId: SESSION })).toEqual([]);
    expect(await listResolvePublicationThreads({ db, publicationId: 'pub-1' })).toEqual([]);
  });
});
