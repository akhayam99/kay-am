import { Button, Textarea } from '@goodboy/ui';
import { RESOLVE_QUEUE_ACTION_LABEL, acceptFixLabel } from '../../resolveQueueCopy';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';

type Props = {
  readonly coveredCount: number;
  readonly reply: string;
  readonly instruction: string;
  readonly isBusy: boolean;
  readonly canAccept: boolean;
  readonly error: string | null;
  readonly onChangeReply: (value: string) => void;
  readonly onChangeInstruction: (value: string) => void;
  readonly onAccept: () => void;
  readonly onAskForChanges: () => void;
  readonly onLater: () => void;
};

export const DecisionBlock = ({
  coveredCount,
  reply,
  instruction,
  isBusy,
  canAccept,
  error,
  onChangeReply,
  onChangeInstruction,
  onAccept,
  onAskForChanges,
  onLater,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
      {RESOLVE_ITEM_LABEL.decision}
    </p>
    <div className="flex min-w-0 flex-col gap-1">
      <label className="text-2xs text-muted-foreground" htmlFor="resolve-item-reply">
        {RESOLVE_ITEM_LABEL.replyPreview}
      </label>
      <Textarea
        id="resolve-item-reply"
        value={reply}
        rows={3}
        onChange={(event) => onChangeReply(event.target.value)}
      />
    </div>
    <div className="flex min-w-0 flex-col gap-1">
      <label className="text-2xs text-muted-foreground" htmlFor="resolve-item-instruction">
        {RESOLVE_QUEUE_ACTION_LABEL.askForChanges}
      </label>
      <Textarea
        id="resolve-item-instruction"
        value={instruction}
        rows={2}
        placeholder="Say what to do differently"
        onChange={(event) => onChangeInstruction(event.target.value)}
      />
    </div>
    {error !== null && <p className="text-2xs text-warning">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="success" disabled={isBusy || !canAccept} onClick={onAccept}>
        {acceptFixLabel({ coveredCount })}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isBusy || instruction.trim() === ''}
        onClick={onAskForChanges}
      >
        {RESOLVE_QUEUE_ACTION_LABEL.askForChanges}
      </Button>
      <Button size="sm" variant="ghost" disabled={isBusy} onClick={onLater}>
        {RESOLVE_QUEUE_ACTION_LABEL.later}
      </Button>
    </div>
  </div>
);
