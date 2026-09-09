import { AlertTriangle, GitBranch } from 'lucide-react';
import { AnchoredPopover, cn, useDropdown } from '@goodboy/ui';
import type { Project, WorkspaceGitStatus } from '@goodboy/types';
import { ProjectGitDetail } from './ProjectGitDetail';
import { projectGitPresentationOf } from './projectGitPresentationOf';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly project: Project;
  readonly status: WorkspaceGitStatus | null;
  readonly shouldShowProjectName: boolean;
};

export const ProjectGitPill = ({ project, status, shouldShowProjectName }: Props) => {
  const isSetup = status?.state === 'absent' || status?.state === 'unborn';
  const dropdown = useDropdown({
    width: isSetup ? 'w-96' : 'w-72',
    expectedWidth: isSetup ? 384 : 288,
    expectedHeight: isSetup ? 520 : 260,
    align: 'end',
  });
  const { actionableCount, uncommittedCount, branch, isWarning } = projectGitPresentationOf({
    status,
  });
  const label = shouldShowProjectName ? `${project.name} · ${branch}` : branch;
  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel={`${project.name} git status`}
      className={cn('max-h-[min(32rem,calc(100vh-2rem))] overflow-y-auto', isSetup && 'w-96')}
      trigger={
        <button
          type="button"
          aria-label={`${project.name} git status: ${branch}`}
          aria-haspopup="dialog"
          aria-expanded={dropdown.open}
          onClick={dropdown.toggle}
          className={cn(
            'relative inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
            actionableCount > 0 || isWarning
              ? 'text-foreground hover:bg-muted/60'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          )}
        >
          <GitBranch size={ICON_SIZE.row} aria-hidden className="shrink-0" />
          <span className="max-w-36 truncate">{label}</span>
          {isWarning ? (
            <span data-testid="project-git-warning" className="flex items-center text-warning">
              <AlertTriangle size={10} aria-hidden />
            </span>
          ) : uncommittedCount > 0 ? (
            <span
              data-testid="project-git-count"
              className="shrink-0 text-2xs tabular-nums text-warning"
            >
              {uncommittedCount} uncommitted
            </span>
          ) : null}
        </button>
      }
    >
      <ProjectGitDetail project={project} status={status} />
    </AnchoredPopover>
  );
};
