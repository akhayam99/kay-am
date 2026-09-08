import { Bot, MessageSquarePlus } from 'lucide-react';
import { cn, Tooltip } from '@goodboy/ui';
import type { ReviewLineTarget } from './ReviewFileDiff';

type Props = {
  readonly target: ReviewLineTarget | null;
  readonly isActive: boolean;
  readonly onToggleComposer: ((target: ReviewLineTarget) => void) | null;
  readonly onAskAgent: ((target: ReviewLineTarget) => void) | null;
};

const ACTION_BTN =
  'flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]';

export const ReviewLineActions = ({ target, isActive, onToggleComposer, onAskAgent }: Props) => {
  if (target === null || onToggleComposer === null || onAskAgent === null) {
    return null;
  }
  return (
    <span className="flex items-center gap-0.5">
      <Tooltip content="Draft a comment on this line">
        <button
          type="button"
          onClick={() => onToggleComposer(target)}
          aria-label={`Draft a comment on ${target.side} line ${target.line}`}
          className={cn(ACTION_BTN, isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
        >
          <MessageSquarePlus size={9} aria-hidden />
        </button>
      </Tooltip>
      <Tooltip content="Ask the agent about this line">
        <button
          type="button"
          onClick={() => onAskAgent(target)}
          aria-label={`Ask the agent about ${target.side} line ${target.line}`}
          className={cn(ACTION_BTN, 'opacity-0 group-hover:opacity-100')}
        >
          <Bot size={9} aria-hidden />
        </button>
      </Tooltip>
    </span>
  );
};
