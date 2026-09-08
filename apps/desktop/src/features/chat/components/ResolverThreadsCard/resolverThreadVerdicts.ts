import type {
  ExtractedCommentAnalysis,
  ExtractedCommentReply,
  ExtractedCommentResolution,
  ExtractedCommentWontfix,
} from '@goodboy/core';

export type ResolverThreadVerdictKind = 'resolved' | 'wontfix' | 'analyzed' | 'open';

export type ResolverThreadVerdict = {
  readonly threadId: string;
  readonly kind: ResolverThreadVerdictKind;
  readonly isClosed: boolean;
  readonly outcome: string;
  readonly commitSha: string | null;
  readonly reply: string | null;
};

type Params = {
  readonly analysisMarkers: ReadonlyArray<ExtractedCommentAnalysis>;
  readonly resolvedMarkers: ReadonlyArray<ExtractedCommentResolution>;
  readonly wontfixMarkers: ReadonlyArray<ExtractedCommentWontfix>;
  readonly replyMarkers: ReadonlyArray<ExtractedCommentReply>;
  readonly resolvedOnGithub: ReadonlySet<string>;
  readonly queuedThreadIds: ReadonlySet<string>;
};

const EXPLAINED_AND_CLOSED = 'explanation posted, thread closed';

const analyzedOutcome = ({
  marker,
  isClosed,
}: {
  readonly marker: ExtractedCommentAnalysis;
  readonly isClosed: boolean;
}): string => {
  if (isClosed) {
    return EXPLAINED_AND_CLOSED;
  }
  if (marker.verdict === 'fix') {
    return `fix recommended: ${marker.summary}`;
  }
  return `no change recommended: ${marker.summary}`;
};

const resolvedOutcome = ({
  isClosed,
  isQueued,
}: {
  readonly isClosed: boolean;
  readonly isQueued: boolean;
}): string => {
  if (isClosed) {
    return 'fix committed, thread closed';
  }
  if (isQueued) {
    return 'fix committed, reply queued';
  }
  return 'fix committed locally';
};

const wontfixOutcome = ({
  marker,
  isClosed,
}: {
  readonly marker: ExtractedCommentWontfix;
  readonly isClosed: boolean;
}): string => {
  if (isClosed) {
    return EXPLAINED_AND_CLOSED;
  }
  return marker.reason;
};

export const resolverThreadVerdicts = ({
  analysisMarkers,
  resolvedMarkers,
  wontfixMarkers,
  replyMarkers,
  resolvedOnGithub,
  queuedThreadIds,
}: Params): ReadonlyArray<ResolverThreadVerdict> => {
  const replyByThreadId = new Map(replyMarkers.map(({ threadId, body }) => [threadId, body]));
  const replyFor = ({ threadId }: { readonly threadId: string }): string | null =>
    replyByThreadId.get(threadId) ?? null;

  return [
    ...analysisMarkers.map((marker) => ({
      threadId: marker.threadId,
      kind: 'analyzed' as const,
      isClosed: resolvedOnGithub.has(marker.threadId),
      outcome: analyzedOutcome({ marker, isClosed: resolvedOnGithub.has(marker.threadId) }),
      commitSha: null,
      reply: replyFor({ threadId: marker.threadId }),
    })),
    ...resolvedMarkers.map((marker) => ({
      threadId: marker.threadId,
      kind: 'resolved' as const,
      isClosed: resolvedOnGithub.has(marker.threadId),
      outcome: resolvedOutcome({
        isClosed: resolvedOnGithub.has(marker.threadId),
        isQueued: queuedThreadIds.has(marker.threadId),
      }),
      commitSha: marker.commitSha,
      reply: replyFor({ threadId: marker.threadId }),
    })),
    ...wontfixMarkers.map((marker) => ({
      threadId: marker.threadId,
      kind: 'wontfix' as const,
      isClosed: resolvedOnGithub.has(marker.threadId),
      outcome: wontfixOutcome({ marker, isClosed: resolvedOnGithub.has(marker.threadId) }),
      commitSha: null,
      reply: replyFor({ threadId: marker.threadId }),
    })),
  ];
};
