export type ResolveDecisionMode = 'reply' | 'revise' | 'refuse';

export type ResolveItemDraft = {
  readonly reply: string | null;
  readonly instruction: string;
  readonly mode: ResolveDecisionMode;
};

export const EMPTY_RESOLVE_ITEM_DRAFT: ResolveItemDraft = {
  reply: null,
  instruction: '',
  mode: 'reply',
};

export const draftReplyText = ({
  draft,
  proposal,
}: {
  readonly draft: ResolveItemDraft;
  readonly proposal: string | null;
}): string => draft.reply ?? proposal ?? '';
