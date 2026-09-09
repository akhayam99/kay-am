import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CountToggle, Tooltip } from '@goodboy/ui';
import type { SessionId, WorktreeStatus } from '@goodboy/types';
import type { LensKind, MountDiffStat } from '../../../../../store';
import type {
  MountProjectGroup,
  MountRowView,
} from '../../../../../store/slices/project-mounts/mountRowModel';
import { ICON_SIZE, projectGlyph } from '../../../../../shared/components/conceptIcons';
import { NewBranchMountAction } from './NewBranchMountAction';
import { ProjectDetachMenu } from './ProjectDetachMenu';
import { ProjectMountRow } from './ProjectMountRow';

type Props = {
  readonly sessionId: SessionId;
  readonly group: MountProjectGroup;
  readonly diffStats: ReadonlyMap<string, MountDiffStat>;
  readonly worktreeStatuses: ReadonlyMap<string, WorktreeStatus>;
  readonly pendingWorktrees: ReadonlySet<string>;
  readonly onSelectLens: (lens: LensKind) => void;
};

type LabelParams = {
  readonly row: MountRowView;
};

const rowLabel = ({ row }: LabelParams): string =>
  row.branch === '' ? row.projectName : `${row.projectName} on ${row.branch}`;

export const ProjectMountGroup = ({
  sessionId,
  group,
  diffStats,
  worktreeStatuses,
  pendingWorktrees,
  onSelectLens,
}: Props) => {
  const [isCompletedShown, setIsCompletedShown] = useState(false);
  const canFork = group.projectKind === 'repo';
  const hasSeriesColumn = [...group.rows, ...group.completedRows].some(
    (row) => row.series !== null,
  );
  const GlyphIcon = projectGlyph({ kind: group.projectKind });
  const headPath =
    group.rows.find((row) => row.worktreePath !== null)?.worktreePath ??
    group.completedRows.find((row) => row.worktreePath !== null)?.worktreePath ??
    '';

  const renderRow = (row: MountRowView) => (
    <ProjectMountRow
      key={row.mountId}
      sessionId={sessionId}
      row={row}
      label={rowLabel({ row })}
      workspaceId={group.workspaceId}
      diffStat={row.worktreePath === null ? null : (diffStats.get(row.worktreePath) ?? null)}
      worktreeStatus={
        row.worktreePath === null ? null : (worktreeStatuses.get(row.worktreePath) ?? null)
      }
      isStatusPending={row.worktreePath !== null && pendingWorktrees.has(row.worktreePath)}
      hasSeriesColumn={hasSeriesColumn}
      onSelectLens={onSelectLens}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-8 w-full items-center gap-2 px-2">
        <GlyphIcon
          size={ICON_SIZE.control}
          aria-hidden
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate text-sm font-medium text-foreground">{group.projectName}</span>
        {group.seriesName === null ? null : (
          <Tooltip content="Each part of this split is its own branch and pull request">
            <span className="truncate text-2xs text-muted-foreground">{group.seriesName}</span>
          </Tooltip>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <CountToggle
            label="Completed"
            count={group.completedRows.length}
            isShown={isCompletedShown}
            icon={ChevronDown}
            onChange={setIsCompletedShown}
          />
          {canFork ? (
            <NewBranchMountAction
              sessionId={sessionId}
              projectId={group.projectId}
              projectName={group.projectName}
            />
          ) : null}
          <ProjectDetachMenu
            sessionId={sessionId}
            projectId={group.projectId}
            workspaceId={group.workspaceId ?? undefined}
            projectName={group.projectName}
            worktreePath={headPath}
            worktreeStatus={worktreeStatuses.get(headPath) ?? null}
          />
        </div>
      </div>
      <ul aria-label={`${group.projectName} branch mounts`} className="flex flex-col gap-1 pl-2">
        {group.rows.map(renderRow)}
        {isCompletedShown ? group.completedRows.map(renderRow) : null}
      </ul>
    </div>
  );
};
