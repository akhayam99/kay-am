import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent, SessionId } from '@goodboy/types';

const { insertSessionEvent, listSessionEvents } = vi.hoisted(() => ({
  insertSessionEvent: vi.fn(async () => undefined),
  listSessionEvents: vi.fn(async () => [] as ReadonlyArray<SessionEvent>),
}));

vi.mock('@goodboy/db', () => ({ insertSessionEvent, listSessionEvents }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

import type { AppStore } from '../../store';
import { decisionsDelta } from './decisionsDelta';
import { loadSessionEvents } from './loadSessionEvents';
import { recordSessionEvent } from './recordSessionEvent';
import { recordSessionEventOnce } from './recordSessionEventOnce';

const sessionId = 'session-1' as SessionId;

type StoreShape = {
  sessionEvents: Record<string, ReadonlyArray<SessionEvent> | undefined>;
};

const makeStore = (initial: StoreShape) => {
  let state = initial;
  const set = (patch: unknown) => {
    const next = typeof patch === 'function' ? (patch as (s: StoreShape) => object)(state) : patch;
    state = { ...state, ...(next as Partial<StoreShape>) };
  };
  const get = () => state;
  return {
    set: set as unknown as (p: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) => void,
    get: get as unknown as () => AppStore,
    read: () => state,
  };
};

describe('session events slice', () => {
  beforeEach(() => {
    insertSessionEvent.mockClear();
    listSessionEvents.mockClear();
  });

  it('loads a session once and skips a repeat read', async () => {
    const stored: ReadonlyArray<SessionEvent> = [
      {
        id: 'ev-1' as SessionEvent['id'],
        sessionId,
        kind: 'branch_created',
        payload: { branch: 'ak/feat' },
        createdAt: '2026-08-21T10:00:00.000Z' as SessionEvent['createdAt'],
      },
    ];
    listSessionEvents.mockResolvedValue(stored);
    const store = makeStore({ sessionEvents: {} });
    const load = loadSessionEvents(store.set, store.get);

    await load({ sessionId });
    await load({ sessionId });

    expect(listSessionEvents).toHaveBeenCalledTimes(1);
    expect(store.read().sessionEvents[sessionId]).toEqual(stored);
  });

  it('re-reads when forced', async () => {
    const store = makeStore({ sessionEvents: {} });
    const load = loadSessionEvents(store.set, store.get);

    await load({ sessionId });
    await load({ sessionId, force: true });

    expect(listSessionEvents).toHaveBeenCalledTimes(2);
  });

  it('persists a recorded event and appends it to a loaded session', async () => {
    const store = makeStore({ sessionEvents: { [sessionId]: [] } });
    const record = recordSessionEvent(store.set);

    await record({ sessionId, kind: 'pr_created', payload: { number: 7, title: 'Ship it' } });

    expect(insertSessionEvent).toHaveBeenCalledTimes(1);
    const appended = store.read().sessionEvents[sessionId] ?? [];
    expect(appended.map((event) => event.kind)).toEqual(['pr_created']);
    expect(appended[0]?.payload).toEqual({ number: 7, title: 'Ship it' });
  });

  it('keeps an unloaded session unloaded after recording', async () => {
    const store = makeStore({ sessionEvents: {} });
    const record = recordSessionEvent(store.set);

    await record({ sessionId, kind: 'pr_merged' });

    expect(insertSessionEvent).toHaveBeenCalledTimes(1);
    expect(store.read().sessionEvents[sessionId]).toBeUndefined();
  });

  it('keeps the appended events ordered oldest first', async () => {
    const earlier: SessionEvent = {
      id: 'ev-0' as SessionEvent['id'],
      sessionId,
      kind: 'worktree_created',
      payload: null,
      createdAt: '2020-01-01T00:00:00.000Z' as SessionEvent['createdAt'],
    };
    const store = makeStore({ sessionEvents: { [sessionId]: [earlier] } });
    const record = recordSessionEvent(store.set);

    await record({ sessionId, kind: 'branch_created' });

    expect((store.read().sessionEvents[sessionId] ?? []).map((event) => event.kind)).toEqual([
      'worktree_created',
      'branch_created',
    ]);
  });

  it('leaves the loaded list untouched when the write fails', async () => {
    insertSessionEvent.mockRejectedValueOnce(new Error('disk full'));
    const store = makeStore({ sessionEvents: { [sessionId]: [] } });
    const record = recordSessionEvent(store.set);

    await record({ sessionId, kind: 'pr_closed' });

    expect(store.read().sessionEvents[sessionId]).toEqual([]);
  });
});

describe('recordSessionEventOnce', () => {
  beforeEach(() => {
    listSessionEvents.mockClear();
    listSessionEvents.mockResolvedValue([]);
  });

  const makeOnceStore = (recorded: ReadonlyArray<SessionEvent>) => {
    const record = vi.fn(async () => undefined);
    listSessionEvents.mockResolvedValue(recorded);
    const get = (() => ({ recordSessionEvent: record })) as unknown as () => AppStore;
    return { get, record };
  };

  it('records a transition the log has never seen', async () => {
    const { get, record } = makeOnceStore([]);

    await recordSessionEventOnce(get)({
      sessionId,
      kind: 'pr_merged',
      payload: { number: 12 },
    });

    expect(record).toHaveBeenCalledWith({
      sessionId,
      kind: 'pr_merged',
      payload: { number: 12 },
    });
  });

  it('skips a transition already recorded for the same pull request', async () => {
    const { get, record } = makeOnceStore([
      {
        id: 'ev-1' as SessionEvent['id'],
        sessionId,
        kind: 'pr_merged',
        payload: { number: 12 },
        createdAt: '2026-08-21T10:00:00.000Z' as SessionEvent['createdAt'],
      },
    ]);

    await recordSessionEventOnce(get)({
      sessionId,
      kind: 'pr_merged',
      payload: { number: 12 },
    });

    expect(record).not.toHaveBeenCalled();
  });

  it('records the same kind again for a different pull request', async () => {
    const { get, record } = makeOnceStore([
      {
        id: 'ev-1' as SessionEvent['id'],
        sessionId,
        kind: 'pr_merged',
        payload: { number: 12 },
        createdAt: '2026-08-21T10:00:00.000Z' as SessionEvent['createdAt'],
      },
    ]);

    await recordSessionEventOnce(get)({
      sessionId,
      kind: 'pr_merged',
      payload: { number: 13 },
    });

    expect(record).toHaveBeenCalledTimes(1);
  });

  it('records the same request number again when it belongs to another repository', async () => {
    const { get, record } = makeOnceStore([
      {
        id: 'ev-1' as SessionEvent['id'],
        sessionId,
        kind: 'pr_merged',
        payload: {
          mountId: 'mount-1',
          provider: 'github',
          host: 'github.com',
          repository: 'acme/web',
          number: 12,
        },
        createdAt: '2026-08-21T10:00:00.000Z' as SessionEvent['createdAt'],
      },
    ]);

    await recordSessionEventOnce(get)({
      sessionId,
      kind: 'pr_merged',
      payload: {
        mountId: 'mount-2',
        provider: 'github',
        host: 'github.com',
        repository: 'acme/api',
        number: 12,
      },
    });

    expect(record).toHaveBeenCalledTimes(1);
  });

  it('skips a repeat of the same request on the same mount', async () => {
    const payload = {
      mountId: 'mount-1',
      provider: 'github',
      host: 'github.com',
      repository: 'acme/web',
      number: 12,
    };
    const { get, record } = makeOnceStore([
      {
        id: 'ev-1' as SessionEvent['id'],
        sessionId,
        kind: 'pr_discovered',
        payload,
        createdAt: '2026-08-21T10:00:00.000Z' as SessionEvent['createdAt'],
      },
    ]);

    await recordSessionEventOnce(get)({ sessionId, kind: 'pr_discovered', payload });

    expect(record).not.toHaveBeenCalled();
  });
});

describe('decisionsDelta', () => {
  it('counts a decision appended to the slot', () => {
    expect(
      decisionsDelta({ previous: '- keep sqlite', next: '- keep sqlite\n- ship the trace' }),
    ).toEqual({ added: 1, removed: 0 });
  });

  it('counts a decision dropped from the slot', () => {
    expect(
      decisionsDelta({ previous: '- keep sqlite\n- ship the trace', next: '- keep sqlite' }),
    ).toEqual({ added: 0, removed: 1 });
  });

  it('ignores bullet punctuation and blank lines', () => {
    expect(decisionsDelta({ previous: '- keep sqlite', next: '\n*  keep sqlite\n\n' })).toEqual({
      added: 0,
      removed: 0,
    });
  });

  it('reports both sides of a replacement', () => {
    expect(decisionsDelta({ previous: '- old call', next: '- new call' })).toEqual({
      added: 1,
      removed: 1,
    });
  });
});
