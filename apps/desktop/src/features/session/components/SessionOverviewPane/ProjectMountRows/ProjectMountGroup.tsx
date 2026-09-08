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

const ICON_BUTTON =
  'relative inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]';

type LabelParams = {
  readonly row: MountRowView;
  readonly isGrouped: boolean;
};

const rowLabel = ({ row, isGrouped }: LabelParams): string => {
  if (!isGrouped || row.branch === '') {
    return row.projectName;
  }
  return `${row.projectName} on ${row.branch}`;
};

export const ProjectMountGroup = ({
  sessionId,
  group,
  diffStats,
  worktreeStatuses,
  pendingWorktrees,
  onSelectLens,
}: Props) => {
  const [isCompletedShown, setIsCompletedShown] = useState(false);
  const total = group.rows.length + group.completedRows.length;
  const isGrouped = total > 1;
  const canFork = group.projectKind === 'repo';
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
      label={rowLabel({ row, isGrouped })}
      workspaceId={group.workspaceId}
      isGrouped={isGrouped}
      canDetachProject={!isGrouped}
      canFork={canFork && !isGrouped}
      diffStat={row.worktreePath === null ? null : (diffStats.get(row.worktreePath) ?? null)}
      worktreeStatus={
        row.worktreePath === null ? null : (worktreeStatuses.get(row.worktreePath) ?? null)
      }
      isStatusPending={row.worktreePath !== null && pendingWorktrees.has(row.worktreePath)}
      onSelectLens={onSelectLens}
    />
  );

  return (
    <div className="flex flex-col">
      {isGrouped ? (
        <div className="flex min-h-9 w-full items-center gap-2 border-b border-border-soft px-3 py-1.5">
          <GlyphIcon
            size={ICON_SIZE.control}
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate text-sm font-medium text-foreground">{group.projectName}</span>
          {group.seriesProgress === null ? null : (
            <Tooltip content="Positions you declared for this split, not a stack">
              <span className="truncate text-2xs tabular-nums text-muted-foreground">
                {group.seriesProgress}
              </span>
            </Tooltip>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
              triggerClassName={ICON_BUTTON}
            />
          </div>
        </div>
      ) : null}
      <ul aria-label={`${group.projectName} branch mounts`} className="flex flex-col">
        {group.rows.map(renderRow)}
      </ul>
      {group.completedRows.length === 0 ? null : (
        <div className="flex flex-col border-b border-border-soft last:border-b-0">
          <div className="flex px-3 py-1">
            <CountToggle
              label="Completed"
              itemsLabel="branch mounts"
              count={group.completedRows.length}
              isShown={isCompletedShown}
              icon={ChevronDown}
              onChange={setIsCompletedShown}
            />
          </div>
          {isCompletedShown ? (
            <ul
              aria-label={`${group.projectName} completed branch mounts`}
              className="flex flex-col"
            >
              {group.completedRows.map(renderRow)}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
};
