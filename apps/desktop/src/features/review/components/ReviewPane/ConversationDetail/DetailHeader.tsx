import { ArrowLeft } from 'lucide-react';
import { Button, Chip, GhostActionButton, OverflowMenu, type OverflowMenuItem } from '@goodboy/ui';
import { formatRelativeAge } from '../../../../../shared/utils/relativeDate';
import {
  BADGE_LABEL,
  BADGE_TONE,
  VERB_LABEL,
  type ConversationVerb,
} from '../../../conversationPresentation';
import type { Conversation } from '../../../selectConversations';
import { VERB_ICON } from '../../../verbPresentation';

type Props = {
  readonly conversation: Conversation;
  readonly isPrimaryDisabled: boolean;
  readonly primaryDisabledReason?: string;
  readonly onBack: (() => void) | null;
  readonly onAct: (verb: ConversationVerb) => void;
  readonly onOpenThread: () => void;
};

export const DetailHeader = ({
  conversation,
  isPrimaryDisabled,
  primaryDisabledReason,
  onBack,
  onAct,
  onOpenThread,
}: Props) => {
  const { presentation, title, head } = conversation;
  const items: ReadonlyArray<OverflowMenuItem> = presentation.secondary.map((verb) => ({
    kind: 'item',
    key: verb,
    label: VERB_LABEL[verb],
    icon: VERB_ICON[verb],
    onClick: () => onAct(verb),
  }));
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-6 py-4">
      <div className="flex items-center gap-2">
        {onBack !== null && (
          <GhostActionButton icon={ArrowLeft} label="Back to conversations" onClick={onBack} />
        )}
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground">
          {title}
        </h2>
        <Chip
          size="3xs"
          bordered={false}
          tone={BADGE_TONE[presentation.badge]}
          label={BADGE_LABEL[presentation.badge]}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={isPrimaryDisabled}
          {...(isPrimaryDisabled &&
            primaryDisabledReason !== undefined && { title: primaryDisabledReason })}
          onClick={() => onAct(presentation.primary)}
        >
          {VERB_LABEL[presentation.primary]}
        </Button>
        {items.length > 0 && <OverflowMenu items={items} label="More conversation actions" />}
      </div>
      {head !== null && (
        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <span className="truncate">{head.author}</span>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span>{formatRelativeAge({ fromIso: head.createdAt })}</span>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <button
            type="button"
            onClick={onOpenThread}
            className="rounded-md underline-offset-2 motion-safe:transition-colors hover:text-foreground hover:underline"
          >
            thread on GitHub
          </button>
        </div>
      )}
    </div>
  );
};
