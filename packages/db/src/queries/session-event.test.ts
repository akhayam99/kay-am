import { describe, expect, it } from 'vitest';
import type { IsoDateTime, SessionEvent, SessionEventId, SessionId } from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrations } from '../migrations';
import { migrate } from '../migrations/runner';
import { deleteSessionEvents, insertSessionEvent, listSessionEvents } from './session-event';

const workspaceId = 'w1';
const sessionId = 's1' as SessionId;

const seed = async () => {
  const db = makeTestDatabase();
  await migrate(db, migrations);
  const now = Date.now();
  await db.execute(
    'INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [workspaceId, 'ws', '/tmp/ws', now, now],
  );
  await db.execute(
    'INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, workspaceId, 'goal', 'idle', now, now],
  );
  return db;
};

type MakeEventParams = {
  readonly overrides?: Partial<SessionEvent>;
};

const makeEvent = ({ overrides = {} }: MakeEventParams): SessionEvent => ({
  id: 'ev-1' as SessionEventId,
  sessionId,
  kind: 'branch_created',
  payload: { branch: 'ak/feat-session-events' },
  createdAt: new Date('2026-08-21T10:00:00.000Z').toISOString() as IsoDateTime,
  ...overrides,
});

describe('session_events queries', () => {
  it('stores and reads back a typed payload', async () => {
    const db = await seed();
    const event = makeEvent({});

    await insertSessionEvent({ db, event });

    expect(await listSessionEvents({ db, sessionId })).toEqual([event]);
  });

  it('lists oldest first', async () => {
    const db = await seed();
    const second = makeEvent({
      overrides: {
        id: 'ev-2' as SessionEventId,
        kind: 'pr_created',
        payload: { number: 42, title: 'Add the trace', url: 'https://example.test/pr/42' },
        createdAt: new Date('2026-08-21T12:00:00.000Z').toISOString() as IsoDateTime,
      },
    });

    await insertSessionEvent({ db, event: second });
    await insertSessionEvent({ db, event: makeEvent({}) });

    expect((await listSessionEvents({ db, sessionId })).map((event) => event.id)).toEqual([
      'ev-1',
      'ev-2',
    ]);
  });

  it('keeps a null payload null', async () => {
    const db = await seed();
    const event = makeEvent({ overrides: { kind: 'pr_ready', payload: null } });

    await insertSessionEvent({ db, event });

    expect((await listSessionEvents({ db, sessionId }))[0]?.payload).toBeNull();
  });

  it('keeps the proposing agent on a materialization proposal', async () => {
    const db = await seed();
    const event = makeEvent({
      overrides: {
        kind: 'project_materialization_proposed',
        payload: {
          projectId: 'project-api',
          projectName: 'api',
          reason: 'edit the contract',
          agentId: 'agent-7',
        },
      },
    });

    await insertSessionEvent({ db, event });

    expect((await listSessionEvents({ db, sessionId }))[0]?.payload?.agentId).toBe('agent-7');
  });

  it('keeps the turn link and the deferral cause on a materialization proposal', async () => {
    const db = await seed();
    const event = makeEvent({
      overrides: {
        kind: 'project_materialization_proposed',
        payload: {
          projectId: 'project-api',
          projectName: 'api',
          reason: 'edit the contract',
          agentId: 'agent-7',
          turnRunId: 'run-42',
          deferralCause: 'batch',
        },
      },
    });

    await insertSessionEvent({ db, event });

    expect((await listSessionEvents({ db, sessionId }))[0]?.payload).toMatchObject({
      turnRunId: 'run-42',
      deferralCause: 'batch',
    });
  });

  it('drops a deferral cause outside the known set', async () => {
    const db = await seed();
    await db.execute(
      'INSERT INTO session_events (id, session_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        'ev-cause',
        sessionId,
        'project_materialization_proposed',
        '{"projectId":"project-api","deferralCause":"vibes","turnRunId":9}',
        Date.parse('2026-08-21T10:00:00.000Z'),
      ],
    );

    expect((await listSessionEvents({ db, sessionId }))[0]?.payload).toEqual({
      projectId: 'project-api',
    });
  });

  it('drops payload fields of the wrong shape', async () => {
    const db = await seed();
    await db.execute(
      'INSERT INTO session_events (id, session_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        'ev-bad',
        sessionId,
        'branch_switched',
        '{"from":"main","to":7,"extra":"ignored"}',
        Date.parse('2026-08-21T10:00:00.000Z'),
      ],
    );

    expect((await listSessionEvents({ db, sessionId }))[0]?.payload).toEqual({ from: 'main' });
  });

  it('keeps reading the feed when a payload is malformed json', async () => {
    const db = await seed();
    await db.execute(
      'INSERT INTO session_events (id, session_id, kind, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        'ev-corrupt',
        sessionId,
        'branch_created',
        '{"branch":"ak/feat',
        Date.parse('2026-08-21T10:00:00.000Z'),
      ],
    );
    await insertSessionEvent({
      db,
      event: makeEvent({
        overrides: {
          id: 'ev-after' as SessionEventId,
          createdAt: new Date('2026-08-21T11:00:00.000Z').toISOString() as IsoDateTime,
        },
      }),
    });

    const events = await listSessionEvents({ db, sessionId });

    expect(events.map((event) => event.id)).toEqual(['ev-corrupt', 'ev-after']);
    expect(events[0]?.payload).toBeNull();
    expect(events[1]?.payload).toEqual({ branch: 'ak/feat-session-events' });
  });

  it('scopes a read to one session', async () => {
    const db = await seed();
    const otherSessionId = 's2' as SessionId;
    const now = Date.now();
    await db.execute(
      'INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [otherSessionId, workspaceId, 'other', 'idle', now, now],
    );
    await insertSessionEvent({ db, event: makeEvent({}) });
    await insertSessionEvent({
      db,
      event: makeEvent({
        overrides: { id: 'ev-other' as SessionEventId, sessionId: otherSessionId },
      }),
    });

    expect((await listSessionEvents({ db, sessionId })).map((event) => event.id)).toEqual(['ev-1']);
  });

  it('deletes every event of a session', async () => {
    const db = await seed();
    await insertSessionEvent({ db, event: makeEvent({}) });

    await deleteSessionEvents({ db, sessionId });

    expect(await listSessionEvents({ db, sessionId })).toEqual([]);
  });

  it('wipes its rows when the session is deleted', async () => {
    const db = await seed();
    await insertSessionEvent({ db, event: makeEvent({}) });

    await db.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);

    expect(await listSessionEvents({ db, sessionId })).toEqual([]);
  });
});
