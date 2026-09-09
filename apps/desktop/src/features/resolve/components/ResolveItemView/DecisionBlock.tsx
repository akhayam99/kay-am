import { Markdown, SectionHeader, Textarea } from '@goodboy/ui';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';

export type ResolveDecisionMode = 'reply' | 'revise';

type Props = {
  readonly fieldId: string;
  readonly reply: string;
  readonly instruction: string;
  readonly mode: ResolveDecisionMode;
  readonly isDelivered: boolean;
  readonly deliveredReply: string | null;
  readonly isBusy: boolean;
  readonly onChangeReply: (value: string) => void;
  readonly onChangeInstruction: (value: string) => void;
};

export const DecisionBlock = ({
  fieldId,
  reply,
  instruction,
  mode,
  isDelivered,
  deliveredReply,
  isBusy,
  onChangeReply,
  onChangeInstruction,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    <SectionHeader
      label={isDelivered ? RESOLVE_ITEM_LABEL.replyPosted : RESOLVE_ITEM_LABEL.reply}
      headingLevel={3}
    />
    {isDelivered ? (
      <Markdown
        text={deliveredReply ?? reply}
        variant="preview"
        className="max-w-[65ch] text-sm text-foreground"
      />
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
        <SectionHeader label="Instructions for agent" headingLevel={3} />
        <Textarea
          id={`${fieldId}-instruction`}
          aria-label="Instructions for agent"
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
