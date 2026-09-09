import { useCallback } from 'react';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import {
  EMPTY_RESOLVE_ITEM_DRAFT,
  draftReplyText,
  type ResolveDecisionMode,
} from '../../resolveItemDraft';

type Params = {
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly proposal: string | null;
};

type ResolveItemDraftHandle = {
  readonly reply: string;
  readonly instruction: string;
  readonly mode: ResolveDecisionMode;
  readonly setReply: (value: string) => void;
  readonly setInstruction: (value: string) => void;
  readonly setMode: (mode: ResolveDecisionMode) => void;
};

export const useResolveItemDraft = ({
  sessionId,
  threadId,
  proposal,
}: Params): ResolveItemDraftHandle => {
  const draft = useAppStore(
    (s) => s.resolveItemDrafts[sessionId]?.[threadId] ?? EMPTY_RESOLVE_ITEM_DRAFT,
  );
  const setResolveItemDraft = useAppStore((s) => s.setResolveItemDraft);

  const setReply = useCallback(
    (value: string) => setResolveItemDraft({ sessionId, threadId, patch: { reply: value } }),
    [sessionId, setResolveItemDraft, threadId],
  );
  const setInstruction = useCallback(
    (value: string) => setResolveItemDraft({ sessionId, threadId, patch: { instruction: value } }),
    [sessionId, setResolveItemDraft, threadId],
  );
  const setMode = useCallback(
    (mode: ResolveDecisionMode) => setResolveItemDraft({ sessionId, threadId, patch: { mode } }),
    [sessionId, setResolveItemDraft, threadId],
  );
  return {
    reply: draftReplyText({ draft, proposal }),
    instruction: draft.instruction,
    mode: draft.mode,
    setReply,
    setInstruction,
    setMode,
  };
};
