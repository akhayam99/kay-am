import type {
  PrComment,
  ResolveAttempt,
  ResolvePublicationThread,
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
} from '@goodboy/types';
import { groupThreads } from '../github/comment-threads';
import { prCommentLocation } from '../session/pr-comment-location';
import {
  deriveResolveQueueStatus,
  type ResolveQueueStatus,
} from '../../store/slices/resolve/deriveResolveQueueStatus';

export type ResolveQueueReviewerNote = {
  readonly body: string;
  readonly author: string;
  readonly createdAtMs: number;
  readonly location: string | null;
  readonly path: string | null;
  readonly line: number | null;
};

export type ResolveQueueRow = {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly status: ResolveQueueStatus;
  readonly attempt: ResolveAttempt | null;
  readonly reviewerNote: ResolveQueueReviewerNote | null;
  readonly proposal: string | null;
  readonly coveredThreadIds: ReadonlyArray<string>;
};

type Params = {
  readonly entries: ReadonlyArray<ResolveQueueItemWithThread>;
  readonly attempts: ReadonlyArray<ResolveAttempt>;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
  readonly comments: ReadonlyArray<PrComment>;
};

const reviewerNoteByThreadId = ({
  comments,
}: {
  readonly comments: ReadonlyArray<PrComment>;
}): ReadonlyMap<string, ResolveQueueReviewerNote> => {
  const map = new Map<string, ResolveQueueReviewerNote>();
  const threads = groupThreads(comments.filter((comment) => comment.source === 'review'));
  for (const thread of threads) {
    const threadId = thread.head.threadId;
    if (threadId == null || threadId === '') {
      continue;
    }
    map.set(threadId, {
      body: thread.head.body,
      author: thread.head.author,
      createdAtMs: Date.parse(thread.head.createdAt),
      location: prCommentLocation({ comment: thread.head }),
      path: thread.head.path ?? null,
      line: thread.head.line ?? null,
    });
  }
  return map;
};

const coveredThreadIdsFor = ({
  thread,
  entries,
}: {
  readonly thread: ResolveThread;
  readonly entries: ReadonlyArray<ResolveQueueItemWithThread>;
}): ReadonlyArray<string> => {
  if (thread.activeAttemptId === null) {
    return [];
  }
  return entries
    .filter(
      (entry) =>
        entry.thread.activeAttemptId === thread.activeAttemptId &&
        entry.thread.threadId !== thread.threadId,
    )
    .map((entry) => entry.thread.threadId);
};

export const buildResolveQueueRows = ({
  entries,
  attempts,
  deliveryReceipts,
  comments,
}: Params): ReadonlyArray<ResolveQueueRow> => {
  const notes = reviewerNoteByThreadId({ comments });
  return entries.map(({ item, thread }) => {
    const attempt =
      thread.activeAttemptId === null
        ? null
        : (attempts.find((candidate) => candidate.id === thread.activeAttemptId) ?? null);
    const status = deriveResolveQueueStatus({
      item,
      thread,
      activeAttempt: attempt,
      deliveryReceipts,
    });
    return {
      item,
      thread,
      status,
      attempt,
      reviewerNote: notes.get(thread.threadId) ?? null,
      proposal: thread.replyDraft,
      coveredThreadIds: coveredThreadIdsFor({ thread, entries }),
    };
  });
};
