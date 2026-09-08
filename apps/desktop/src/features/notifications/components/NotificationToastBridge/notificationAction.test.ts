import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAction } from '@goodboy/db';
import type { AgentId, SessionId } from '@goodboy/types';

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;

import { mapNotificationAction } from './';

const retrySummarizerSpy = vi.fn();
const retryStepSummarySpy = vi.fn(async () => undefined);
const retryPublicationSpy = vi.fn(async () => ({
  publicationId: 'pub-1',
  repo: 'acme/web',
  prNumber: 248,
  branch: 'feature/retry',
  localHead: 'abc',
  remoteHead: null,
  requiresPush: false,
  commits: [],
  replies: [],
  excluded: [],
  blocker: null,
}));
const publishConversationsSpy = vi.fn(async () => ({
  kind: 'done' as const,
  pushed: false,
  resolved: 1,
  commented: 0,
  failed: 0,
}));
const setCurrentSessionSpy = vi.fn(async () => undefined);
const setActiveLensSpy = vi.fn();
const selectAgentSpy = vi.fn(async () => undefined);
const emitNotificationSpy = vi.fn(async () => undefined);

type FakeStore = {
  summarizerStatus: Record<
    string,
    { lastAttempt?: { turnInput: string; turnOutput: string } } | undefined
  >;
  retrySummarizer: typeof retrySummarizerSpy;
  retryStepSummary: typeof retryStepSummarySpy;
  retryPublication: typeof retryPublicationSpy;
  publishConversations: typeof publishConversationsSpy;
  setCurrentSession: typeof setCurrentSessionSpy;
  setActiveLens: typeof setActiveLensSpy;
  selectAgent: typeof selectAgentSpy;
  emitNotification: typeof emitNotificationSpy;
};

function buildStore(overrides: Partial<FakeStore> = {}): FakeStore {
  return {
    summarizerStatus: {},
    retrySummarizer: retrySummarizerSpy,
    retryStepSummary: retryStepSummarySpy,
    retryPublication: retryPublicationSpy,
    publishConversations: publishConversationsSpy,
    setCurrentSession: setCurrentSessionSpy,
    setActiveLens: setActiveLensSpy,
    selectAgent: selectAgentSpy,
    emitNotification: emitNotificationSpy,
    ...overrides,
  };
}

describe('mapNotificationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retry-summarizer: returns undefined when lastAttempt is missing', () => {
    const action: NotificationAction = { kind: 'retry-summarizer', sessionId: SESSION_ID };
    const store = buildStore({ summarizerStatus: { [SESSION_ID]: undefined } });
    const result = mapNotificationAction(action, store as never);
    expect(result).toBeUndefined();
  });

  it('retry-summarizer: returns action with Retry label when lastAttempt exists', () => {
    const lastAttempt = { turnInput: 'user prompt', turnOutput: 'agent reply' };
    const action: NotificationAction = { kind: 'retry-summarizer', sessionId: SESSION_ID };
    const store = buildStore({ summarizerStatus: { [SESSION_ID]: { lastAttempt } } });
    const toastAction = mapNotificationAction(action, store as never);
    expect(toastAction?.label).toBe('Retry');
  });

  it('retry-summarizer: onClick calls retrySummarizer with sessionId', () => {
    const lastAttempt = { turnInput: 'user prompt', turnOutput: 'agent reply' };
    const action: NotificationAction = { kind: 'retry-summarizer', sessionId: SESSION_ID };
    const store = buildStore({ summarizerStatus: { [SESSION_ID]: { lastAttempt } } });
    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    expect(retrySummarizerSpy).toHaveBeenCalledWith(SESSION_ID);
  });

  it('retry-step-summary: returns action with Retry label', () => {
    const action: NotificationAction = {
      kind: 'retry-step-summary',
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
    };
    const store = buildStore();
    const toastAction = mapNotificationAction(action, store as never);
    expect(toastAction?.label).toBe('Retry');
  });

  it('retry-step-summary: onClick calls retryStepSummary with correct params', () => {
    const action: NotificationAction = {
      kind: 'retry-step-summary',
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
    };
    const store = buildStore();
    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    expect(retryStepSummarySpy).toHaveBeenCalledWith({ sessionId: SESSION_ID, agentId: AGENT_ID });
  });

  it('open-agent: returns action with Open agent label', () => {
    const action: NotificationAction = {
      kind: 'open-agent',
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
    };
    const store = buildStore();
    const toastAction = mapNotificationAction(action, store as never);
    expect(toastAction?.label).toBe('Open agent');
  });

  it('open-agent: onClick opens the session, selects the agent and reveals the chat', async () => {
    const action: NotificationAction = {
      kind: 'open-agent',
      sessionId: SESSION_ID,
      agentId: AGENT_ID,
    };
    const store = buildStore();
    const revealed = vi.fn();
    window.addEventListener('goodboy:reveal-chat', revealed);

    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    await vi.waitFor(() => expect(revealed).toHaveBeenCalled());

    expect(setCurrentSessionSpy).toHaveBeenCalledWith(SESSION_ID);
    expect(setActiveLensSpy).toHaveBeenCalledWith(SESSION_ID, 'agents');
    expect(selectAgentSpy).toHaveBeenCalledWith(SESSION_ID, AGENT_ID);
    window.removeEventListener('goodboy:reveal-chat', revealed);
  });

  it('retry-publication: returns action with Retry label', () => {
    const action: NotificationAction = { kind: 'retry-publication', sessionId: SESSION_ID };
    const store = buildStore();
    const toastAction = mapNotificationAction(action, store as never);
    expect(toastAction?.label).toBe('Retry');
  });

  it('retry-publication: onClick reconciles a failed publication and publishes the fresh preview', async () => {
    const action: NotificationAction = { kind: 'retry-publication', sessionId: SESSION_ID };
    const store = buildStore();
    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    await vi.waitFor(() =>
      expect(publishConversationsSpy).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        publicationId: 'pub-1',
      }),
    );
    expect(retryPublicationSpy).toHaveBeenCalledWith({ sessionId: SESSION_ID });
  });

  it('retry-publication: reports a rejected retry instead of leaving an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const action: NotificationAction = { kind: 'retry-publication', sessionId: SESSION_ID };
    const store = buildStore({
      retryPublication: vi.fn(async () => {
        throw new Error('the pull request could not be read');
      }) as unknown as typeof retryPublicationSpy,
    });

    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    await vi.waitFor(() => expect(emitNotificationSpy).toHaveBeenCalled());

    expect(emitNotificationSpy).toHaveBeenCalledWith(
      'error',
      'error',
      'retry failed, conversations left open',
      expect.stringContaining('the pull request could not be read'),
      { sessionId: SESSION_ID },
    );
    expect(publishConversationsSpy).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('retry-publication: reports a rejected publication', async () => {
    const action: NotificationAction = { kind: 'retry-publication', sessionId: SESSION_ID };
    const store = buildStore({
      publishConversations: vi.fn(async () => {
        throw new Error('github refused the reply');
      }) as unknown as typeof publishConversationsSpy,
    });

    const toastAction = mapNotificationAction(action, store as never);
    toastAction?.onClick();
    await vi.waitFor(() => expect(emitNotificationSpy).toHaveBeenCalled());

    expect(emitNotificationSpy).toHaveBeenCalledWith(
      'error',
      'error',
      'retry failed, conversations left open',
      expect.stringContaining('github refused the reply'),
      { sessionId: SESSION_ID },
    );
  });
});
