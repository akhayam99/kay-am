import type { PrComment, ResolveAttempt, ResolveThread } from '@goodboy/types';
import { groupThreads, type CommentThread } from '../github/comment-threads';
import { prCommentLocation } from '../session/pr-comment-location';
import {
  conversationPresentation,
  type ConversationBadge,
  type ConversationPresentation,
} from './conversationPresentation';

export type Conversation = {
  readonly threadId: string;
  readonly title: string;
  readonly head: PrComment | null;
  readonly replies: ReadonlyArray<PrComment>;
  readonly row: ResolveThread | null;
  readonly attempt: ResolveAttempt | null;
  readonly presentation: ConversationPresentation;
  readonly siblings: ReadonlyArray<string>;
};

export type ConversationGroupKey = ConversationBadge;

export type ConversationGroup = {
  readonly key: ConversationGroupKey;
  readonly label: string;
  readonly conversations: ReadonlyArray<Conversation>;
};

export const GROUP_ORDER: ReadonlyArray<ConversationGroupKey> = [
  'needs_you',
  'working',
  'ready',
  'open',
  'resolved',
];

export const GROUP_LABEL: Record<ConversationGroupKey, string> = {
  needs_you: 'Needs you',
  working: 'Working',
  ready: 'Ready',
  open: 'Open',
  resolved: 'Resolved',
};

type Params = {
  readonly comments: ReadonlyArray<PrComment>;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly attempts?: ReadonlyArray<ResolveAttempt>;
  readonly waitingHolders?: ReadonlyArray<string>;
  readonly isWriterBusy?: boolean;
  readonly branchShas?: ReadonlySet<string> | null;
};

const FALLBACK_TITLE = 'conversation';

const titleOf = ({ head }: { readonly head: PrComment | null }): string => {
  if (head === null) {
    return FALLBACK_TITLE;
  }
  return prCommentLocation({ comment: head }) ?? FALLBACK_TITLE;
};

const reviewThreads = ({
  comments,
}: {
  readonly comments: ReadonlyArray<PrComment>;
}): ReadonlyArray<CommentThread> =>
  groupThreads(comments.filter((comment) => comment.source === 'review')).filter(
    (thread) => thread.head.threadId != null && thread.head.threadId !== '',
  );

const siblingsOf = ({
  row,
  rows,
}: {
  readonly row: ResolveThread | null;
  readonly rows: ReadonlyArray<ResolveThread>;
}): ReadonlyArray<string> => {
  if (row === null || row.activeAttemptId === null) {
    return [];
  }
  return rows
    .filter(
      (candidate) =>
        candidate.activeAttemptId === row.activeAttemptId && candidate.threadId !== row.threadId,
    )
    .map((candidate) => candidate.threadId);
};

export const selectConversations = ({
  comments,
  rows,
  attempts = [],
  waitingHolders = [],
  isWriterBusy = false,
  branchShas,
}: Params): ReadonlyArray<Conversation> => {
  const threads = reviewThreads({ comments });
  const seen = new Set<string>();
  const waiting = new Set(waitingHolders);
  const build = ({
    threadId,
    head,
    replies,
    isOrphan,
  }: {
    readonly threadId: string;
    readonly head: PrComment | null;
    readonly replies: ReadonlyArray<PrComment>;
    readonly isOrphan: boolean;
  }): Conversation => {
    const row = rows.find((candidate) => candidate.threadId === threadId) ?? null;
    const attempt =
      row?.activeAttemptId == null
        ? null
        : (attempts.find((candidate) => candidate.id === row.activeAttemptId) ?? null);
    const presentation = conversationPresentation({
      row,
      attempt,
      isLeaseWaiting: attempt !== null && waiting.has(attempt.agentId),
      isWriterBusy,
      ...(branchShas !== undefined && { branchShas }),
      isOrphan,
      isResolvedOnGithub: head?.resolved === true,
    });
    return {
      threadId,
      title: titleOf({ head }),
      head,
      replies,
      row,
      attempt,
      presentation,
      siblings: siblingsOf({ row, rows }),
    };
  };
  const fromGithub = threads.map((thread) => {
    const threadId = thread.head.threadId ?? '';
    seen.add(threadId);
    return build({ threadId, head: thread.head, replies: thread.replies, isOrphan: false });
  });
  const orphans = rows
    .filter((row) => !seen.has(row.threadId))
    .map((row) => build({ threadId: row.threadId, head: null, replies: [], isOrphan: true }));
  return [...fromGithub, ...orphans];
};

export const groupConversations = ({
  conversations,
}: {
  readonly conversations: ReadonlyArray<Conversation>;
}): ReadonlyArray<ConversationGroup> =>
  GROUP_ORDER.flatMap((key) => {
    const members = conversations.filter((conversation) => conversation.presentation.badge === key);
    return members.length === 0 ? [] : [{ key, label: GROUP_LABEL[key], conversations: members }];
  });
