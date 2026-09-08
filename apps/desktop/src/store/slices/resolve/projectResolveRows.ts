import type { ResolveAttempt, ResolveThread, SessionId } from '@goodboy/types';
import type { SliceParams } from './types';

type Params = SliceParams & {
  readonly sessionId: SessionId;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly attempts: ReadonlyArray<ResolveAttempt>;
};

export const projectResolveRows = ({ set, sessionId, rows, attempts }: Params): void => {
  set((state) => ({
    sessionResolveThreads: { ...state.sessionResolveThreads, [sessionId]: rows },
    sessionResolveAttempts: { ...state.sessionResolveAttempts, [sessionId]: attempts },
  }));
};
