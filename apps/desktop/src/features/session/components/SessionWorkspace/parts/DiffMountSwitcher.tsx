import type { SessionId, SessionProjectMount } from '@goodboy/types';
import { cn } from '@goodboy/ui';
import { useAppStore, useMountDiffStats } from '../../../../../store';
import { DIFF_CAPPED_COLUMN_CLASS } from '../../../../permissions/components/DiffViewerDialog/lib';
import { DiffStat } from '../../DiffStat';

type Props = {
  readonly sessionId: SessionId;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly selectedWorktreePath: string | null;
  readonly isDiffEmpty: boolean;
};

export const DiffMountSwitcher = ({
  sessionId,
  mounts,
  selectedWorktreePath,
  isDiffEmpty,
}: Props) => {
  const openMountDiff = useAppStore((s) => s.openMountDiff);
  const diffStats = useMountDiffStats(sessionId);

  return (
    <div className="shrink-0 px-6 pt-5">
      <div className={cn(isDiffEmpty && DIFF_CAPPED_COLUMN_CLASS)}>
        <div
          role="group"
          aria-label="Project mounts"
          data-testid="diff-mount-switcher"
          className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-border-soft bg-subtle p-1"
        >
          {mounts.map((mount) => {
            const isNameShared =
              mounts.filter((candidate) => candidate.mountName === mount.mountName).length > 1;
            const stat = diffStats.get(mount.worktreePath) ?? null;
            const hasChanges = stat != null && (stat.additions > 0 || stat.deletions > 0);
            const statState = stat == null ? 'pending' : hasChanges ? 'changed' : 'quiet';
            const isSelected = mount.worktreePath === selectedWorktreePath;
            return (
              <button
                key={mount.mountId ?? mount.worktreePath}
                type="button"
                aria-pressed={isSelected}
                title={mount.worktreePath}
                data-testid="diff-mount-option"
                data-stat={statState}
                onClick={() => openMountDiff(sessionId, mount.worktreePath)}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium motion-safe:transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isSelected
                    ? 'bg-elevated font-semibold text-foreground ring-1 ring-inset ring-border'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                  !isSelected && hasChanges && 'text-foreground/80',
                )}
              >
                <span className="min-w-0 truncate">{mount.mountName}</span>
                {isNameShared && mount.branch !== '' ? (
                  <span className="min-w-0 shrink truncate font-mono text-3xs text-muted-foreground">
                    {mount.branch}
                  </span>
                ) : null}
                <span className="flex min-w-16 shrink-0 justify-end">
                  {stat == null ? null : hasChanges ? (
                    <DiffStat additions={stat.additions} deletions={stat.deletions} />
                  ) : (
                    <span className="text-3xs tabular-nums text-muted-foreground/50">
                      no changes
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
