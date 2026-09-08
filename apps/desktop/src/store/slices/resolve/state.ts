import type {
  ResolveAttempt,
  ResolvePublication,
  ResolvePublicationPreview,
  ResolveQueueItemWithThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';

export type ResolveState = {
  readonly sessionResolveThreads: Readonly<Record<SessionId, ReadonlyArray<ResolveThread>>>;
  readonly sessionResolveAttempts: Readonly<Record<SessionId, ReadonlyArray<ResolveAttempt>>>;
  readonly sessionResolveQueueItems: Readonly<
    Record<SessionId, ReadonlyArray<ResolveQueueItemWithThread>>
  >;
  readonly sessionResolvePublications: Readonly<
    Record<SessionId, ReadonlyArray<ResolvePublication>>
  >;
  readonly activePublicationPreview: Readonly<Record<SessionId, ResolvePublicationPreview | null>>;
};

export const resolveInitialState: ResolveState = {
  sessionResolveThreads: {},
  sessionResolveAttempts: {},
  sessionResolveQueueItems: {},
  sessionResolvePublications: {},
  activePublicationPreview: {},
};
