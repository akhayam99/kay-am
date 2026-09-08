import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId } from '@goodboy/types';
import { createSessionViewSlice } from './index';

const SESSION_ID = 'session-1' as SessionId;

type SliceState = ReturnType<typeof createSessionViewSlice>;

const buildSlice = (): { readonly actions: SliceState; readonly getState: () => SliceState } => {
  let state = {} as SliceState;
  const set = (updater: Partial<SliceState> | ((s: SliceState) => Partial<SliceState>)): void => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = (): SliceState => state;
  const actions = createSessionViewSlice(
    set as Parameters<typeof createSessionViewSlice>[0],
    get as Parameters<typeof createSessionViewSlice>[1],
  );
  state = { ...actions, selectedAgentId: {}, sessionPhaseRuns: {} } as SliceState;
  return { actions, getState: get };
};

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
});

describe('the round trip between the resolve queue and the diff', () => {
  it('pins the order, the open item and the scroll position, and points the diff at the candidate', () => {
    const { actions, getState } = buildSlice();

    actions.openResolveDiff({
      sessionId: SESSION_ID,
      threadId: 't-parser',
      sha: 'candidate-sha',
      path: 'src/parser.ts',
      line: 31,
      order: ['t-retry', 't-parser', 't-client'],
      scrollTop: 240,
    });

    const state = getState();
    expect(state.resolveQueueView[SESSION_ID]).toEqual({
      filter: 'for_you',
      expandedThreadId: 't-parser',
      order: ['t-retry', 't-parser', 't-client'],
      scrollTop: 240,
    });
    expect(state.resolveDiffReturn[SESSION_ID]).toEqual({
      threadId: 't-parser',
      path: 'src/parser.ts',
      line: 31,
    });
    expect(state.diffFocus[SESSION_ID]).toEqual({
      kind: 'commit',
      sha: 'candidate-sha',
      path: 'src/parser.ts',
    });
    expect(state.activeLens[SESSION_ID]).toBe('files');
  });

  it('returns to the queue with the pinned position intact and the pill gone', () => {
    const { actions, getState } = buildSlice();
    actions.setResolveQueueView({ sessionId: SESSION_ID, patch: { filter: 'everything' } });
    actions.openResolveDiff({
      sessionId: SESSION_ID,
      threadId: 't-parser',
      sha: 'candidate-sha',
      path: 'src/parser.ts',
      line: 31,
      order: ['t-retry', 't-parser'],
      scrollTop: 120,
    });

    actions.returnFromResolveDiff({ sessionId: SESSION_ID });

    const state = getState();
    expect(state.activeLens[SESSION_ID]).toBe('review');
    expect(state.resolveDiffReturn[SESSION_ID]).toBeNull();
    expect(state.resolveQueueView[SESSION_ID]).toEqual({
      filter: 'everything',
      expandedThreadId: 't-parser',
      order: ['t-retry', 't-parser'],
      scrollTop: 120,
    });
  });

  it('keeps every other session out of the round trip', () => {
    const { actions, getState } = buildSlice();
    actions.openResolveDiff({
      sessionId: SESSION_ID,
      threadId: 't-parser',
      sha: 'candidate-sha',
      path: null,
      line: null,
      order: ['t-parser'],
      scrollTop: 10,
    });

    expect(getState().resolveQueueView['session-2' as SessionId]).toBeUndefined();
  });
});
