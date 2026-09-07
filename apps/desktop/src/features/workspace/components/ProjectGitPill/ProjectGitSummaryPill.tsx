import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, GitBranch } from 'lucide-react';
import { AnchoredPopover, cn, useDropdown } from '@goodboy/ui';
import type { ProjectId } from '@goodboy/types';
import type { ProjectGitStatusEntry } from '../../hooks/useProjectGitStatuses';
import { ProjectGitDetail } from './ProjectGitDetail';
import { projectGitPresentationOf } from './projectGitPresentationOf';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly entries: ReadonlyArray<ProjectGitStatusEntry>;
};

type SummaryEntry = ProjectGitStatusEntry & {
  readonly actionableCount: number;
  readonly branch: string;
  readonly isWarning: boolean;
};

export const ProjectGitSummaryPill = ({ entries }: Props) => {
  const dropdown = useDropdown({
    width: 'w-80',
    expectedWidth: 320,
    expectedHeight: 420,
    align: 'end',
  });
  const [selectedProjectId, setSelectedProjectId] = useState<ProjectId | null>(null);
  const summaryEntries = useMemo<ReadonlyArray<SummaryEntry>>(
    () =>
      entries
        .map((entry) => ({ ...entry, ...projectGitPresentationOf({ status: entry.status }) }))
        .sort((left, right) => {
          if (left.isWarning !== right.isWarning) {
            return left.isWarning ? -1 : 1;
          }
          if (left.actionableCount !== right.actionableCount) {
            return right.actionableCount - left.actionableCount;
          }
          return left.project.name.localeCompare(right.project.name);
        }),
    [entries],
  );
  const selectedEntry =
    summaryEntries.find((entry) => entry.project.id === selectedProjectId) ?? null;
  const hasWarning = summaryEntries.some((entry) => entry.isWarning);
  const actionableCount = summaryEntries.reduce((total, entry) => total + entry.actionableCount, 0);

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel="Repository git statuses"
      className="w-80 max-h-[min(32rem,calc(100vh-2rem))] overflow-y-auto"
      trigger={
        <button
          type="button"
          aria-label={`${entries.length} repository git statuses`}
          aria-haspopup="dialog"
          aria-expanded={dropdown.open}
          onClick={dropdown.toggle}
          className={cn(
            'relative inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
            actionableCount > 0 || hasWarning
              ? 'text-foreground hover:bg-muted/60'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
        >
          <GitBranch size={ICON_SIZE.row} aria-hidden className="shrink-0" />
          <span>{entries.length} repos</span>
          {hasWarning ? (
            <span
              data-testid="project-git-summary-warning"
              className="flex items-center text-warning"
            >
              <AlertTriangle size={10} aria-hidden />
            </span>
          ) : actionableCount > 0 ? (
            <span
              data-testid="project-git-summary-count"
              className="flex min-w-3.5 items-center justify-center rounded-full bg-warning px-1 text-3xs font-semibold leading-3.5 text-warning-foreground"
            >
              {actionableCount}
            </span>
          ) : null}
        </button>
      }
    >
      {selectedEntry == null ? (
        <div className="flex flex-col">
          {summaryEntries.map((entry) => (
            <button
              key={entry.project.id}
              type="button"
              onClick={() => setSelectedProjectId(entry.project.id)}
              className="flex h-9 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {entry.project.name}
              </span>
              <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                {entry.branch}
              </span>
              <span className="flex w-5 shrink-0 justify-end">
                {entry.isWarning ? (
                  <AlertTriangle size={11} aria-label="Warning" className="text-warning" />
                ) : entry.actionableCount > 0 ? (
                  <span className="flex min-w-3.5 items-center justify-center rounded-full bg-warning px-1 text-3xs font-semibold leading-3.5 text-warning-foreground">
                    {entry.actionableCount}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setSelectedProjectId(null)}
            className="flex h-9 items-center gap-1.5 border-b border-border-soft px-3 text-xs font-medium transition-colors hover:bg-muted/50"
          >
            <ChevronLeft size={ICON_SIZE.row} aria-hidden />
            <span className="truncate">{selectedEntry.project.name}</span>
          </button>
          <ProjectGitDetail project={selectedEntry.project} status={selectedEntry.status} />
        </div>
      )}
    </AnchoredPopover>
  );
};
