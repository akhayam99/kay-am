import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverrideSettings, WorkspaceId } from '@goodboy/types';
import type { AppStore } from '../../store';
import { overridesWithAttribution } from '../../../__tests__/helpers/attributionOverrides';

const listChannelsSpy = vi.fn();
const listUsersSpy = vi.fn();
const listThreadHeadsSpy = vi.fn();
const getThreadSpy = vi.fn();
const postReplySpy = vi.fn();
const addReactionSpy = vi.fn();

vi.mock('../../../features/integrations/slack/client', () => ({
  slackListChannels: (...args: ReadonlyArray<unknown>) => listChannelsSpy(...args),
  slackListUsers: (...args: ReadonlyArray<unknown>) => listUsersSpy(...args),
  slackListThreadHeads: (...args: ReadonlyArray<unknown>) => listThreadHeadsSpy(...args),
  slackGetThread: (...args: ReadonlyArray<unknown>) => getThreadSpy(...args),
  slackPostReply: (...args: ReadonlyArray<unknown>) => postReplySpy(...args),
  slackAddReaction: (...args: ReadonlyArray<unknown>) => addReactionSpy(...args),
}));

const { createSlackThreadsSlice, initialSlackThreadsState, slackChannelKey, slackThreadKey } =
  await import('./index');

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const CHANNEL_ID = 'C024BE7LR';
const THREAD_TS = '1723456789.123456';
const REPLY_TS = '1723456999.000100';

type TestState = Record<string, unknown>;

type BuildStoreParams = {
  readonly workspaceOverrides?: Record<string, OverrideSettings>;
};

const buildStore = ({ workspaceOverrides = {} }: BuildStoreParams = {}) => {
  let state: TestState = { ...initialSlackThreadsState, workspaceOverrides };
  const set = (partial: unknown) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...(next as TestState) };
  };
  const get = () => state as unknown as AppStore;
  const slice = createSlackThreadsSlice(
    set as Parameters<typeof createSlackThreadsSlice>[0],
    get as Parameters<typeof createSlackThreadsSlice>[1],
  );
  Object.assign(state, slice);
  return { getState: () => state, slice };
};

describe('slack-threads slice', () => {
  beforeEach(() => {
    listChannelsSpy.mockReset();
    listUsersSpy.mockReset();
    listThreadHeadsSpy.mockReset();
    getThreadSpy.mockReset();
    postReplySpy.mockReset();
    addReactionSpy.mockReset();
  });

  it('caches channels per workspace', async () => {
    listChannelsSpy.mockResolvedValue([{ id: CHANNEL_ID, name: 'eng-alerts' }]);
    const store = buildStore();

    await store.slice.refreshSlackChannels({ workspaceId: WORKSPACE_ID });

    expect(listChannelsSpy).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
    const entry = (store.getState().slackChannels as Record<string, { channels: unknown[] }>)[
      WORKSPACE_ID
    ];
    expect(entry?.channels).toHaveLength(1);
  });

  it('caches thread heads under a workspace and channel key', async () => {
    listThreadHeadsSpy.mockResolvedValue([{ ts: THREAD_TS }]);
    const store = buildStore();

    await store.slice.refreshSlackThreadHeads({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
    });

    const key = slackChannelKey({ workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID });
    expect(
      (store.getState().slackThreadHeads as Record<string, { heads: unknown[] }>)[key]?.heads,
    ).toHaveLength(1);
  });

  it('caches one thread so every surface reads the same messages', async () => {
    getThreadSpy.mockResolvedValue([{ ts: THREAD_TS }, { ts: '1723456999.000100' }]);
    const store = buildStore();

    await store.slice.refreshSlackThread({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
    });

    const key = slackThreadKey({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
    });
    const entry = (
      store.getState().slackThreads as Record<
        string,
        { messages: unknown[]; loading: boolean; error: string | null }
      >
    )[key];
    expect(entry?.messages).toHaveLength(2);
    expect(entry?.loading).toBe(false);
    expect(entry?.error).toBeNull();
  });

  it('records the failure instead of clearing the thread already on screen', async () => {
    getThreadSpy.mockResolvedValueOnce([{ ts: THREAD_TS }]);
    const store = buildStore();
    const target = { workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID, threadTs: THREAD_TS };
    await store.slice.refreshSlackThread(target);

    getThreadSpy.mockRejectedValueOnce(new Error('missing_scope: channels:history'));
    await store.slice.refreshSlackThread(target, { force: true });

    const key = slackThreadKey(target);
    const entry = (
      store.getState().slackThreads as Record<
        string,
        { messages: unknown[]; error: string | null; loading: boolean }
      >
    )[key];
    expect(entry?.error).toContain('missing_scope: channels:history');
    expect(entry?.messages).toHaveLength(1);
    expect(entry?.loading).toBe(false);
  });

  it('posts the reply into the thread it is reading and refreshes past an in-flight fetch', async () => {
    postReplySpy.mockResolvedValue({ ts: REPLY_TS });
    getThreadSpy.mockResolvedValue([{ ts: THREAD_TS }, { ts: REPLY_TS }]);
    listThreadHeadsSpy.mockResolvedValue([{ ts: THREAD_TS }]);
    const store = buildStore();
    const key = slackThreadKey({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
    });
    store.getState().slackThreads = {
      [key]: { messages: [], fetchedAt: null, loading: true, error: null },
    };

    await store.slice.replyToSlackThread({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
      text: 'on it',
    });

    expect(postReplySpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
      text: `on it\n\n_Written by Goodboy_`,
    });
    expect(getThreadSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
    });
    expect(listThreadHeadsSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
    });
    expect(
      (store.getState().slackThreads as Record<string, { messages: unknown[] }>)[key]?.messages,
    ).toHaveLength(2);
  });

  it('reacts to the message it was asked about, not to the thread root', async () => {
    addReactionSpy.mockResolvedValue(undefined);
    getThreadSpy.mockResolvedValue([{ ts: THREAD_TS }, { ts: REPLY_TS }]);
    listThreadHeadsSpy.mockResolvedValue([{ ts: THREAD_TS }]);
    const store = buildStore();

    await store.slice.addSlackReaction({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
      messageTs: REPLY_TS,
      name: 'eyes',
    });

    expect(addReactionSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      messageTs: REPLY_TS,
      name: 'eyes',
    });
    expect(getThreadSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
    });
  });

  it('drops the attribution line when the workspace switched it off', async () => {
    postReplySpy.mockResolvedValue({ ts: REPLY_TS });
    getThreadSpy.mockResolvedValue([]);
    listThreadHeadsSpy.mockResolvedValue([]);
    const store = buildStore({
      workspaceOverrides: {
        [WORKSPACE_ID]: overridesWithAttribution({ attributionFooter: false }),
      },
    });

    await store.slice.replyToSlackThread({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
      text: 'on it',
    });

    expect(postReplySpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      threadTs: THREAD_TS,
      text: 'on it',
    });
  });

  it('surfaces a failed write instead of refreshing over it', async () => {
    postReplySpy.mockRejectedValueOnce(new Error('missing_scope: chat:write'));
    const store = buildStore();

    await expect(
      store.slice.replyToSlackThread({
        workspaceId: WORKSPACE_ID,
        channelId: CHANNEL_ID,
        threadTs: THREAD_TS,
        text: 'on it',
      }),
    ).rejects.toThrow('missing_scope: chat:write');
    expect(getThreadSpy).not.toHaveBeenCalled();
    expect(listThreadHeadsSpy).not.toHaveBeenCalled();
  });

  it('keeps the known user list when the directory call fails', async () => {
    listUsersSpy.mockResolvedValueOnce([{ id: 'U1', name: 'ada' }]);
    const store = buildStore();
    await store.slice.refreshSlackUsers({ workspaceId: WORKSPACE_ID });

    listUsersSpy.mockRejectedValueOnce(new Error('ratelimited'));
    await store.slice.refreshSlackUsers({ workspaceId: WORKSPACE_ID });

    expect(
      (store.getState().slackUsers as Record<string, ReadonlyArray<unknown>>)[WORKSPACE_ID],
    ).toHaveLength(1);
  });
});
