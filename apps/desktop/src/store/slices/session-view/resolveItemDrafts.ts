import type { SessionId } from '@goodboy/types';
import {
  EMPTY_RESOLVE_ITEM_DRAFT,
  type ResolveItemDraft,
} from '../../../features/resolve/resolveItemDraft';
import type { SetFn } from './types';

type PatchParams = {
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly patch: Partial<ResolveItemDraft>;
};

export const setResolveItemDraft = (set: SetFn) => {
  return ({ sessionId, threadId, patch }: PatchParams): void => {
    set((s) => ({
      resolveItemDrafts: {
        ...s.resolveItemDrafts,
        [sessionId]: {
          ...(s.resolveItemDrafts[sessionId] ?? {}),
          [threadId]: {
            ...(s.resolveItemDrafts[sessionId]?.[threadId] ?? EMPTY_RESOLVE_ITEM_DRAFT),
            ...patch,
          },
        },
      },
    }));
  };
};
