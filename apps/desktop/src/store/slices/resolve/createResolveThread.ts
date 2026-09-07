import type { Agent, ProjectId, ResolveThread, SessionId } from '@goodboy/types';

type Params = {
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly agent?: Agent;
  readonly projectId?: ProjectId | null;
  readonly prNumber?: number;
};

export const createResolveThread = ({
  sessionId,
  threadId,
  agent,
  projectId = null,
  prNumber,
}: Params): ResolveThread => {
  const numberFromUrl = agent?.sourceCommentUrl?.match(/\/pull\/(\d+)/)?.[1];
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    sessionId,
    threadId,
    projectId,
    prNumber: numberFromUrl === undefined ? (prNumber ?? 0) : Number(numberFromUrl),
    originKind: agent?.sourceKind ?? 'review_comment',
    state: 'open',
    stateReason: null,
    revision: 0,
    activeAttemptId: null,
    disposition: null,
    replyDraft: null,
    commitShas: null,
    question: null,
    replyPostedAt: null,
    replyId: null,
    githubResolved: null,
    closedAt: null,
    closedSource: null,
    createdAt: now,
    updatedAt: now,
  };
};
