import type {
  ResolveAttempt,
  ResolveCandidate,
  ResolveCandidateItem,
  ResolveCheckRun,
  ResolvePublication,
  ResolvePublicationPreview,
  ResolveQueueItemWithThread,
  ResolveThread,
  ResolveUncapturedWork,
  SessionId,
} from '@goodboy/types';

export type ResolveCandidateWithItems = Readonly<{
  candidate: ResolveCandidate;
  items: ReadonlyArray<ResolveCandidateItem>;
}>;

export type ResolveState = {
  readonly sessionResolveThreads: Readonly<Record<SessionId, ReadonlyArray<ResolveThread>>>;
  readonly sessionResolveAttempts: Readonly<Record<SessionId, ReadonlyArray<ResolveAttempt>>>;
  readonly sessionResolveCandidates: Readonly<
    Record<SessionId, ReadonlyArray<ResolveCandidateWithItems>>
  >;
  readonly sessionResolveCheckRuns: Readonly<Record<SessionId, ReadonlyArray<ResolveCheckRun>>>;
  readonly sessionResolveQueueItems: Readonly<
    Record<SessionId, ReadonlyArray<ResolveQueueItemWithThread>>
  >;
  readonly sessionResolvePublications: Readonly<
    Record<SessionId, ReadonlyArray<ResolvePublication>>
  >;
  readonly sessionResolveUncapturedWork: Readonly<Record<SessionId, ResolveUncapturedWork | null>>;
  readonly activePublicationPreview: Readonly<Record<SessionId, ResolvePublicationPreview | null>>;
};

export const resolveInitialState: ResolveState = {
  sessionResolveThreads: {},
  sessionResolveAttempts: {},
  sessionResolveCandidates: {},
  sessionResolveCheckRuns: {},
  sessionResolveQueueItems: {},
  sessionResolvePublications: {},
  sessionResolveUncapturedWork: {},
  activePublicationPreview: {},
};
