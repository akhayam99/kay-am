import type { SessionId } from '@goodboy/types';
import { EMPTY_RESOLVE_QUEUE_VIEW, type GetFn, type ResolveQueueView, type SetFn } from './types';

type ViewParams = {
  readonly sessionId: SessionId;
  readonly patch: Partial<ResolveQueueView>;
};

type OpenParams = {
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly sha: string;
  readonly path: string | null;
  readonly line: number | null;
  readonly order: ReadonlyArray<string>;
  readonly scrollTop: number;
};

type ReturnParams = { readonly sessionId: SessionId };

export const setResolveQueueView = (set: SetFn) => {
  return ({ sessionId, patch }: ViewParams): void => {
    set((s) => ({
      resolveQueueView: {
        ...s.resolveQueueView,
        [sessionId]: {
          ...(s.resolveQueueView[sessionId] ?? EMPTY_RESOLVE_QUEUE_VIEW),
          ...patch,
        },
      },
    }));
  };
};

export const openResolveDiff = (set: SetFn, get: GetFn) => {
  return ({ sessionId, threadId, sha, path, line, order, scrollTop }: OpenParams): void => {
    set((s) => ({
      resolveQueueView: {
        ...s.resolveQueueView,
        [sessionId]: {
          ...(s.resolveQueueView[sessionId] ?? EMPTY_RESOLVE_QUEUE_VIEW),
          expandedThreadId: threadId,
          order,
          scrollTop,
        },
      },
      resolveDiffReturn: { ...s.resolveDiffReturn, [sessionId]: { threadId, path, line } },
    }));
    get().openDiffLens(sessionId, { kind: 'commit', sha, path });
  };
};

export const returnFromResolveDiff = (set: SetFn, get: GetFn) => {
  return ({ sessionId }: ReturnParams): void => {
    set((s) => ({ resolveDiffReturn: { ...s.resolveDiffReturn, [sessionId]: null } }));
    get().setActiveLens(sessionId, 'review');
  };
};
