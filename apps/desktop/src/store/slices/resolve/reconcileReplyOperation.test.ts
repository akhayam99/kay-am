import { describe, expect, it } from 'vitest';
import type { PrComment, ResolvePublicationThread } from '@goodboy/types';
import { reconcileReplyOperation } from './reconcileReplyOperation';

const ATTEMPTED_AT = 1_700_000_000_000;

const thread: ResolvePublicationThread = {
  publicationId: 'pub-1',
  threadId: 'PRRT_1',
  revision: 1,
  priorState: 'answered',
  sourceFingerprint: 'abc',
  operationId: 'op-1',
  replyBody: 'Already handled elsewhere',
  replyPhase: 'uncertain',
  replyId: null,
  replyAttemptedAt: ATTEMPTED_AT,
  replyPostedAt: null,
  resolvePhase: 'uncertain',
  resolvedAt: null,
  error: 'network timeout',
};

const commentOf = ({ id }: { readonly id: string }): PrComment =>
  ({
    id,
    threadId: 'PRRT_1',
    body: 'Already handled elsewhere',
    source: 'review',
  }) as unknown as PrComment;

describe('reconcileReplyOperation', () => {
  it('calls one matching reply posted', () => {
    expect(
      reconcileReplyOperation({
        thread,
        comments: [commentOf({ id: 'c1' })],
        observedAt: ATTEMPTED_AT + 1000,
        isObservationTrusted: true,
      }),
    ).toBe('posted');
  });

  it('calls an empty thread not posted, so a retry is safe', () => {
    expect(
      reconcileReplyOperation({
        thread,
        comments: [],
        observedAt: ATTEMPTED_AT + 1000,
        isObservationTrusted: true,
      }),
    ).toBe('not_posted');
  });

  it('refuses to decide when two identical replies are already there', () => {
    expect(
      reconcileReplyOperation({
        thread,
        comments: [commentOf({ id: 'c1' }), commentOf({ id: 'c2' })],
        observedAt: ATTEMPTED_AT + 1000,
        isObservationTrusted: true,
      }),
    ).toBe('ambiguous');
  });

  it('refuses to decide on an observation older than the attempt', () => {
    expect(
      reconcileReplyOperation({
        thread,
        comments: [],
        observedAt: ATTEMPTED_AT - 1000,
        isObservationTrusted: true,
      }),
    ).toBe('ambiguous');
  });

  it('refuses to decide when the pull request could not be read', () => {
    expect(
      reconcileReplyOperation({
        thread,
        comments: [],
        observedAt: ATTEMPTED_AT + 1000,
        isObservationTrusted: false,
      }),
    ).toBe('ambiguous');
  });
});
