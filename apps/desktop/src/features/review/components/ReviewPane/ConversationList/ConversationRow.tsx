import { CardAction, Checkbox, Chip, SelectableRow, StatusDot, cn, tintClasses } from '@goodboy/ui';
import { formatRelativeAge } from '../../../../../shared/utils/relativeDate';
import {
  BADGE_LABEL,
  BADGE_TONE,
  VERB_LABEL,
  type ConversationBadge,
  type ConversationVerb,
} from '../../../conversationPresentation';
import type { Conversation } from '../../../selectConversations';
import { VERB_ICON, formatElapsed, siblingSentence } from '../../../verbPresentation';

type Props = {
  readonly conversation: Conversation;
  readonly rowId: string;
  readonly siblingTitles: ReadonlyArray<string>;
  readonly isFocused: boolean;
  readonly isChecked: boolean;
  readonly isHighlighted: boolean;
  readonly isDisabled: boolean;
  readonly disabledReason?: string;
  readonly nowMs: number;
  readonly onSelect: () => void;
  readonly onToggleCheck: () => void;
  readonly onAct: (verb: ConversationVerb) => void;
  readonly onHoverSiblings: (threadIds: ReadonlyArray<string>) => void;
};

const ROW_ACTION_BADGES: ReadonlySet<ConversationBadge> = new Set<ConversationBadge>([
  'open',
  'needs_you',
  'resolved',
]);

export const ConversationRow = ({
  conversation,
  rowId,
  siblingTitles,
  isFocused,
  isChecked,
  isHighlighted,
  isDisabled,
  disabledReason,
  nowMs,
  onSelect,
  onToggleCheck,
  onAct,
  onHoverSiblings,
}: Props) => {
  const { presentation, title, head, siblings } = conversation;
  const tint = tintClasses(BADGE_TONE[presentation.badge]);
  const elapsed =
    presentation.elapsedFrom === null
      ? null
      : formatElapsed({ fromMs: presentation.elapsedFrom, nowMs });
  const shared = siblingSentence({ titles: siblingTitles });
  const supporting = presentation.supporting ?? shared;
  const hasRowAction = ROW_ACTION_BADGES.has(presentation.badge);
  const ActionIcon = VERB_ICON[presentation.primary];
  return (
    <li
      role="presentation"
      data-attempt={conversation.row?.activeAttemptId ?? undefined}
      className="group/conversation-row flex min-w-0 items-center gap-2"
    >
      {presentation.isSelectable ? (
        <Checkbox
          checked={isChecked}
          onChange={onToggleCheck}
          ariaLabel={`Select ${title}`}
          className="shrink-0"
        />
      ) : (
        <span aria-hidden className="size-3.5 shrink-0" />
      )}
      <SelectableRow
        id={rowId}
        role="option"
        ariaSelected={isFocused}
        tabIndex={-1}
        selected={isFocused}
        onClick={onSelect}
        title={title}
        className={cn(
          'min-w-0 flex-1 px-2.5 py-2',
          presentation.isRunning &&
            cn('border-l-2', tint.border, 'motion-safe:animate-border-pulse'),
          isHighlighted && 'ring-1 ring-info/40',
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5 text-left">
          <span className="flex min-w-0 items-center gap-2">
            {presentation.isRunning && <StatusDot tone="info" size="sm" pulsing />}
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium leading-5 text-foreground">
              {title}
            </span>
            <Chip
              size="3xs"
              bordered={false}
              tone={BADGE_TONE[presentation.badge]}
              label={BADGE_LABEL[presentation.badge]}
            />
          </span>
          {supporting !== null && (
            <span
              className="truncate text-2xs text-muted-foreground"
              onMouseEnter={() => onHoverSiblings(siblings)}
              onMouseLeave={() => onHoverSiblings([])}
            >
              {supporting}
            </span>
          )}
          <span className="flex min-w-0 items-center gap-1.5 text-3xs text-muted-foreground/70">
            {head !== null && <span className="truncate">{head.author}</span>}
            {head !== null && <span aria-hidden>·</span>}
            {head !== null && <span>{formatRelativeAge({ fromIso: head.createdAt, nowMs })}</span>}
            {elapsed !== null && <span aria-hidden>·</span>}
            {elapsed !== null && <span className="tabular-nums">{elapsed}</span>}
            {shared !== null && presentation.supporting !== null && <span aria-hidden>·</span>}
            {shared !== null && presentation.supporting !== null && (
              <span className="truncate">{shared}</span>
            )}
          </span>
        </span>
      </SelectableRow>
      {hasRowAction && (
        <CardAction
          reveal
          revealGroup="group-hover/conversation-row:opacity-100 group-focus-within/conversation-row:opacity-100"
          icon={ActionIcon}
          label={`${VERB_LABEL[presentation.primary]} ${title}`}
          tooltip={isDisabled ? disabledReason : VERB_LABEL[presentation.primary]}
          tone={BADGE_TONE[presentation.badge]}
          disabled={isDisabled}
          onClick={() => onAct(presentation.primary)}
        />
      )}
    </li>
  );
};
