import type { ResolveAttempt, ResolveThread, SessionId } from '@goodboy/types';

export type ResolveState = {
  readonly sessionResolveThreads: Readonly<Record<SessionId, ReadonlyArray<ResolveThread>>>;
  readonly sessionResolveAttempts: Readonly<Record<SessionId, ReadonlyArray<ResolveAttempt>>>;
};

export const resolveInitialState: ResolveState = {
  sessionResolveThreads: {},
  sessionResolveAttempts: {},
};
