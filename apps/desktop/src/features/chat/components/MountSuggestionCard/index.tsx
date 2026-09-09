import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button, cn, IconButton, tintClasses } from '@goodboy/ui';
import type { MaterializationDeferralCause } from '@goodboy/types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly projectName: string;
  readonly agentName: string;
  readonly reason: string;
  readonly cause: MaterializationDeferralCause | null;
  readonly onMount: () => void;
  readonly onDismiss: () => void;
};

type SentenceParams = {
  readonly projectName: string;
  readonly agentName: string;
  readonly cause: MaterializationDeferralCause | null;
};

const consequenceSentence = ({ projectName, agentName, cause }: SentenceParams): string => {
  const lead = `Mount ${projectName} so ${agentName} can use it in this session`;
  switch (cause) {
    case 'batch':
      return `${lead}; this request has already mounted two projects.`;
    case 'scope':
    case null:
      return `${lead}; this expands the session beyond its two-project allowance for unnamed projects.`;
    default: {
      const exhaustive: never = cause;
      return exhaustive;
    }
  }
};

export const MountSuggestionCard = ({
  projectName,
  agentName,
  reason,
  cause,
  onMount,
  onDismiss,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounting, setIsMounting] = useState(false);
  const tint = tintClasses('info');

  return (
    <section
      aria-label={`Mount suggestion for ${projectName}`}
      data-testid="mount-suggestion-card"
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2 text-xs',
        tint.borderSoft,
        tint.bgSoft,
        isMounting && 'spin-border spin-border-info',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('flex shrink-0 items-center', tint.icon)}>
          <CONCEPT_ICONS.mount size={ICON_SIZE.row} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-xs text-foreground">
          {consequenceSentence({ projectName, agentName, cause })}
        </span>
        <Button
          variant="info"
          emphasis="outline"
          size="sm"
          isBusy={isMounting}
          busyLabel="Mounting"
          onClick={() => {
            setIsMounting(true);
            onMount();
          }}
          data-testid="mount-suggestion-mount"
        >
          Mount project
        </Button>
        <IconButton
          icon={ChevronRight}
          variant="ghost"
          label={`Mount suggestion details for ${projectName}`}
          aria-expanded={isOpen}
          iconSize={ICON_SIZE.row}
          className={cn('shrink-0 motion-safe:transition-transform', isOpen && 'rotate-90')}
          onClick={() => setIsOpen((open) => !open)}
          data-testid="mount-suggestion-disclosure"
        />
      </div>
      {isOpen ? (
        <div className="flex min-w-0 flex-col gap-1.5 pl-6">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Reason</span>
          <span className="min-w-0 text-xs text-foreground/80">{reason}</span>
          <span className="text-2xs text-muted-foreground">
            Requested by {agentName} for {projectName}.
          </span>
          <span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              data-testid="mount-suggestion-dismiss"
            >
              Dismiss suggestion
            </Button>
          </span>
        </div>
      ) : null}
    </section>
  );
};
