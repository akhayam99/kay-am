import { describe, expect, it } from 'vitest';
import type { AgentId, PrComment, ResolveAttempt, ResolveThread } from '@goodboy/types';
import { groupConversations, selectConversations } from './selectConversations';

const comment = ({
  id,
  threadId,
  path,
  line,
  source = 'review',
  resolved = false,
}: {
  readonly id: string;
  readonly threadId?: string;
  readonly path?: string;
  readonly line?: number;
  readonly source?: 'issue' | 'review';
  readonly resolved?: boolean;
}): PrComment => ({
  id,
  author: 'dhh',
  authorAvatarUrl: null,
  body: 'body',
  createdAt: '2026-01-01T00:00:00Z',
  url: `https://example.test/${id}`,
  source,
  resolved,
  threadId,
  path,
  line,
});

const rowOf = (patch: Partial<ResolveThread>): ResolveThread =>
  ({ stateReason: null, commitShas: null, activeAttemptId: null, ...patch }) as ResolveThread;

const attemptOf = (patch: Partial<ResolveAttempt>): ResolveAttempt =>
  ({ phase: 'running', startedAt: 1, threadIds: [], ...patch }) as ResolveAttempt;

describe('selectConversations', () => {
  it('titles a row by path and line and falls back for a thread without a location', () => {
    const conversations = selectConversations({
      comments: [
        comment({ id: '1', threadId: 't1', path: 'src/retry.ts', line: 84 }),
        comment({ id: '2', threadId: 't2' }),
      ],
      rows: [],
    });

    expect(conversations.map((item) => item.title)).toEqual(['src/retry.ts:84', 'conversation']);
  });

  it('keeps general PR comments out of the list entirely', () => {
    const conversations = selectConversations({
      comments: [comment({ id: '1', source: 'issue' }), comment({ id: '2', threadId: 't2' })],
      rows: [],
    });

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.threadId).toBe('t2');
  });

  it('reads a GitHub thread with no row as Open, and a resolved one as Resolved elsewhere', () => {
    const conversations = selectConversations({
      comments: [
        comment({ id: '1', threadId: 't1' }),
        comment({ id: '2', threadId: 't2', resolved: true }),
      ],
      rows: [],
    });

    expect(conversations[0]?.presentation.badge).toBe('open');
    expect(conversations[1]?.presentation.badge).toBe('resolved');
    expect(conversations[1]?.presentation.supporting).toBe('Resolved elsewhere');
  });

  it('files a row whose thread is gone from the pull request under Resolved', () => {
    const conversations = selectConversations({
      comments: [comment({ id: '1', threadId: 't1' })],
      rows: [rowOf({ threadId: 'gone', state: 'fixed', disposition: 'fix' })],
    });

    const orphan = conversations.find((item) => item.threadId === 'gone');
    expect(orphan?.presentation.badge).toBe('resolved');
    expect(orphan?.presentation.supporting).toBe('Not on this pull request');
  });

  it('names the siblings of a shared attempt on every row that shares it', () => {
    const conversations = selectConversations({
      comments: [
        comment({ id: '1', threadId: 't1' }),
        comment({ id: '2', threadId: 't2' }),
        comment({ id: '3', threadId: 't3' }),
      ],
      rows: [
        rowOf({ threadId: 't1', state: 'working', activeAttemptId: 'a1' }),
        rowOf({ threadId: 't2', state: 'working', activeAttemptId: 'a1' }),
        rowOf({ threadId: 't3', state: 'working', activeAttemptId: 'a2' }),
      ],
      attempts: [attemptOf({ id: 'a1' }), attemptOf({ id: 'a2' })],
    });

    expect(conversations[0]?.siblings).toEqual(['t2']);
    expect(conversations[1]?.siblings).toEqual(['t1']);
    expect(conversations[2]?.siblings).toEqual([]);
  });

  it('marks a row waiting when the writer lease lists its agent', () => {
    const conversations = selectConversations({
      comments: [comment({ id: '1', threadId: 't1' })],
      rows: [rowOf({ threadId: 't1', state: 'working', activeAttemptId: 'a1' })],
      attempts: [attemptOf({ id: 'a1', agentId: 'agent-1' as AgentId })],
      waitingHolders: ['agent-1'],
    });

    expect(conversations[0]?.presentation.supporting).toBe('Waiting for current work');
  });

  it('orders groups needs you, working, ready, open, resolved and hides empty ones', () => {
    const conversations = selectConversations({
      comments: [
        comment({ id: '1', threadId: 'open' }),
        comment({ id: '2', threadId: 'ready' }),
        comment({ id: '3', threadId: 'needs' }),
        comment({ id: '4', threadId: 'done' }),
      ],
      rows: [
        rowOf({ threadId: 'ready', state: 'answered', disposition: 'reply' }),
        rowOf({ threadId: 'needs', state: 'failed', stateReason: 'interrupted' }),
        rowOf({ threadId: 'done', state: 'closed', closedSource: 'goodboy' }),
      ],
    });

    expect(groupConversations({ conversations }).map((group) => group.key)).toEqual([
      'needs_you',
      'ready',
      'open',
      'resolved',
    ]);
  });
});
