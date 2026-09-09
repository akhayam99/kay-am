import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@goodboy/ui';
import type { DetachDetails as Details } from './detachPlan';

type Props = {
  readonly projectName: string;
  readonly details: Details;
  readonly isBusy: boolean;
  readonly onKeepFiles?: () => void;
};

export const DetachDetails = ({ projectName, details, isBusy, onKeepFiles }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        aria-label={`Detach details for ${projectName}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-2xs font-medium text-muted-foreground motion-safe:transition-colors hover:bg-muted hover:text-foreground"
      >
        <Chevron size={10} aria-hidden />
        Details
      </button>
      {isOpen ? (
        <div className="flex min-w-0 flex-col gap-2">
          {details.totals.length === 0 ? null : (
            <ul className="flex min-w-0 flex-col gap-0.5 text-2xs text-foreground">
              {details.totals.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
          {details.worktrees.length === 0 ? null : (
            <ul className="flex min-w-0 flex-col gap-1 border-t border-border pt-2 text-2xs text-muted-foreground">
              {details.worktrees.map((detail) => (
                <li key={detail} className="break-words">
                  {detail}
                </li>
              ))}
            </ul>
          )}
          {onKeepFiles === undefined ? null : (
            <Button
              size="sm"
              variant="secondary"
              emphasis="outline"
              disabled={isBusy}
              className="w-fit"
              onClick={onKeepFiles}
            >
              Detach and keep files
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
};
