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
  isDeliveryComplete,
  resolveDeliveryReceiptsFor,
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

export type ResolveQueueDelivery = {
  readonly isReplyPosted: boolean;
  readonly replyPostedAt: number | null;
  readonly isThreadResolved: boolean;
  readonly resolvedAt: number | null;
  readonly isComplete: boolean;
  readonly replyBody: string | null;
};

export type ResolveProposalKind = 'fix' | 'reply_only' | 'none';

export type ResolveQueueRow = {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly status: ResolveQueueStatus;
  readonly attempt: ResolveAttempt | null;
  readonly reviewerNote: ResolveQueueReviewerNote | null;
  readonly proposal: string | null;
  readonly proposalKind: ResolveProposalKind;
  readonly coveredThreadIds: ReadonlyArray<string>;
  readonly delivery: ResolveQueueDelivery | null;
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

const proposalKindFor = ({
  item,
  thread,
}: {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
}): ResolveProposalKind => {
  if (item.integratedSha !== null || (thread.commitShas?.length ?? 0) > 0) {
    return 'fix';
  }
  const draft = thread.replyDraft;
  if (draft !== null && draft.trim() !== '') {
    return 'reply_only';
  }
  return 'none';
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

const deliveryFor = ({
  item,
  thread,
  deliveryReceipts,
}: {
  readonly item: ResolveQueueItem;
  readonly thread: ResolveThread;
  readonly deliveryReceipts: ReadonlyArray<ResolvePublicationThread>;
}): ResolveQueueDelivery | null => {
  const receipts = resolveDeliveryReceiptsFor({ item, thread, deliveryReceipts });
  const latest = receipts.reduce<ResolvePublicationThread | null>(
    (best, receipt) =>
      best === null || (receipt.replyAttemptedAt ?? 0) >= (best.replyAttemptedAt ?? 0)
        ? receipt
        : best,
    null,
  );
  if (latest === null) {
    return null;
  }
  return {
    isReplyPosted: latest.replyPhase === 'posted',
    replyPostedAt: latest.replyPostedAt,
    isThreadResolved: latest.resolvePhase === 'resolved',
    resolvedAt: latest.resolvedAt,
    isComplete: isDeliveryComplete({ receipt: latest }),
    replyBody: latest.replyBody,
  };
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
      proposalKind: proposalKindFor({ item, thread }),
      coveredThreadIds: coveredThreadIdsFor({ thread, entries }),
      delivery: deliveryFor({ item, thread, deliveryReceipts }),
    };
  });
};
