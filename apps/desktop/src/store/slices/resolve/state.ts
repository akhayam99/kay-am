import type {
  ResolveAttempt,
  ResolvePublication,
  ResolvePublicationPreview,
  ResolveThread,
  SessionId,
} from '@goodboy/types';

export type ResolveState = {
  readonly sessionResolveThreads: Readonly<Record<SessionId, ReadonlyArray<ResolveThread>>>;
  readonly sessionResolveAttempts: Readonly<Record<SessionId, ReadonlyArray<ResolveAttempt>>>;
  readonly sessionResolvePublications: Readonly<
    Record<SessionId, ReadonlyArray<ResolvePublication>>
  >;
  readonly activePublicationPreview: Readonly<Record<SessionId, ResolvePublicationPreview | null>>;
};

export const resolveInitialState: ResolveState = {
  sessionResolveThreads: {},
  sessionResolveAttempts: {},
  sessionResolvePublications: {},
  activePublicationPreview: {},
};
