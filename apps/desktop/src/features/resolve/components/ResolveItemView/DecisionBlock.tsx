import { Markdown, SectionHeader, Textarea } from '@goodboy/ui';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';
import type { ResolveProposalKind } from '../../buildResolveQueueRows';
import type { ResolveDecisionMode } from '../../resolveItemDraft';

const INSTRUCTION_LABEL = 'Instructions for agent';

type Props = {
  readonly fieldId: string;
  readonly reply: string;
  readonly instruction: string;
  readonly mode: ResolveDecisionMode;
  readonly proposalKind: ResolveProposalKind;
  readonly isAnswering: boolean;
  readonly isDelivered: boolean;
  readonly deliveredReply: string | null;
  readonly deliverySupport: string | null;
  readonly isBusy: boolean;
  readonly onChangeReply: (value: string) => void;
  readonly onChangeInstruction: (value: string) => void;
};

const sectionLabel = ({
  mode,
  isDelivered,
}: {
  readonly mode: ResolveDecisionMode;
  readonly isDelivered: boolean;
}): string => {
  if (isDelivered) {
    return RESOLVE_ITEM_LABEL.replyPosted;
  }
  return mode === 'refuse' ? RESOLVE_ITEM_LABEL.refusalReply : RESOLVE_ITEM_LABEL.reply;
};

const proposalHint = ({
  proposalKind,
}: {
  readonly proposalKind: ResolveProposalKind;
}): string | undefined => {
  if (proposalKind === 'none') {
    return RESOLVE_ITEM_LABEL.noProposal;
  }
  if (proposalKind === 'reply_only') {
    return RESOLVE_ITEM_LABEL.replyOnlyProposal;
  }
  return undefined;
};

const sectionHint = ({
  mode,
  isDelivered,
  proposalKind,
}: {
  readonly mode: ResolveDecisionMode;
  readonly isDelivered: boolean;
  readonly proposalKind: ResolveProposalKind;
}): string | undefined => {
  if (mode === 'refuse') {
    return RESOLVE_ITEM_LABEL.refusalNote;
  }
  if (isDelivered) {
    return undefined;
  }
  return proposalHint({ proposalKind });
};

export const DecisionBlock = ({
  fieldId,
  reply,
  instruction,
  mode,
  proposalKind,
  isAnswering,
  isDelivered,
  deliveredReply,
  deliverySupport,
  isBusy,
  onChangeReply,
  onChangeInstruction,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    <SectionHeader
      label={sectionLabel({ mode, isDelivered })}
      hint={sectionHint({ mode, isDelivered, proposalKind })}
      headingLevel={3}
    />
    {isDelivered ? (
      <>
        <Markdown
          text={deliveredReply ?? reply}
          variant="preview"
          className="max-w-[65ch] text-sm text-foreground"
        />
        {deliverySupport !== null && (
          <p className="text-2xs text-muted-foreground">{deliverySupport}</p>
        )}
      </>
    ) : (
      <Textarea
        id={`${fieldId}-reply`}
        aria-label={RESOLVE_ITEM_LABEL.replyPreview}
        value={reply}
        rows={3}
        disabled={isBusy}
        className="max-h-48 text-sm"
        onChange={(event) => onChangeReply(event.target.value)}
      />
    )}
    {mode === 'revise' && (
      <div className="flex min-w-0 flex-col gap-2">
        <SectionHeader
          label={isAnswering ? RESOLVE_ITEM_LABEL.agentAnswer : INSTRUCTION_LABEL}
          headingLevel={3}
        />
        <Textarea
          id={`${fieldId}-instruction`}
          aria-label={isAnswering ? RESOLVE_ITEM_LABEL.agentAnswer : INSTRUCTION_LABEL}
          value={instruction}
          rows={3}
          disabled={isBusy}
          className="max-h-48 text-sm"
          onChange={(event) => onChangeInstruction(event.target.value)}
        />
      </div>
    )}
  </div>
);
