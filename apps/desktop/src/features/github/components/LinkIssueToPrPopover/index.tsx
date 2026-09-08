import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { SessionId } from '@goodboy/types';
import { AnchoredPopover, Button, formatError, useDropdown } from '@goodboy/ui';
import { useAppStore } from '../../../../store';
import { appendClosingReferences } from '../../appendClosingReferences';
import type { ClosingIssueReference } from '../../closingIssueReferences';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly prNumber: number;
  readonly body: string;
  readonly candidates: ReadonlyArray<ClosingIssueReference>;
};

export const LinkIssueToPrPopover = ({ sessionId, prNumber, body, candidates }: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [pendingNumber, setPendingNumber] = useState<number | null>(null);
  const editPr = useAppStore((state) => state.editPr);
  const dropdown = useDropdown({
    align: 'end',
    expectedHeight: 260,
    expectedWidth: 384,
    width: 'w-96 max-w-[calc(100vw-2rem)]',
  });
  const { close, toggle } = dropdown;

  const handlePick = async (reference: ClosingIssueReference) => {
    setError(null);
    setPendingNumber(reference.number);
    try {
      await editPr(sessionId, prNumber, {
        body: appendClosingReferences({ body, references: [reference] }),
      });
      close();
    } catch (linkError) {
      setError(formatError(linkError));
    } finally {
      setPendingNumber(null);
    }
  };

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel="Link an issue to this pull request"
      className="p-3"
      anchorClassName="min-w-0"
      trigger={
        <Button variant="ghost" size="sm" onClick={toggle}>
          <Plus size={ICON_SIZE.row} aria-hidden />
          Link issue
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-foreground">
          Link an issue to this pull request
        </span>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Link the issue to the session first, from the integrations lens.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((candidate) => (
              <button
                key={candidate.number}
                type="button"
                disabled={pendingNumber !== null}
                onClick={() => void handlePick(candidate)}
                aria-label={`Link issue ${candidate.identifier} to this pull request`}
                className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] disabled:pointer-events-none disabled:opacity-40"
              >
                <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                  {candidate.identifier}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {candidate.title}
                </span>
              </button>
            ))}
          </div>
        )}
        {error !== null ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </AnchoredPopover>
  );
};
