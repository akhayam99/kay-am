import { useEffect, useMemo } from 'react';
import type { Session } from '@goodboy/types';
import type { LensKind } from '../../../../../store';
import { useAppStore, useMountDiffStats } from '../../../../../store';
import { MountCleanupProposals } from '../MountCleanupProposals';
import { MountProjectAction } from './MountProjectAction';
import { ProjectMountGroup } from './ProjectMountGroup';
import { useMountRows } from './useMountRows';
import { useWorktreeStatusPending, useWorktreeStatuses } from '../../../hooks/useWorktreeStatuses';

type Props = {
  readonly session: Session;
  readonly onSelectLens: (lens: LensKind) => void;
};

export const ProjectMountRows = ({ session, onSelectLens }: Props) => {
  const groups = useMountRows({ sessionId: session.id });
  const loadSessionMounts = useAppStore((state) => state.loadSessionMounts);
  const loadPrSeries = useAppStore((state) => state.loadPrSeries);
  const diffStats = useMountDiffStats(session.id);
  const worktreeTargets = useMemo(
    () =>
      groups.flatMap((group) =>
        [...group.rows, ...group.completedRows].flatMap((row) =>
          row.worktreePath === null || !row.isAttached
            ? []
            : [{ worktreePath: row.worktreePath, baseBranch: row.baseBranch ?? undefined }],
        ),
      ),
    [groups],
  );
  const worktreeStatuses = useWorktreeStatuses({ targets: worktreeTargets });
  const pendingWorktrees = useWorktreeStatusPending({ targets: worktreeTargets });

  useEffect(() => {
    void loadSessionMounts({ sessionId: session.id }).catch(() => undefined);
    void loadPrSeries({ sessionId: session.id }).catch(() => undefined);
  }, [session.id]);

  return (
    <section aria-label="Mounted projects" className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border-soft bg-elevated/30 px-3 py-2">
          <span className="text-sm text-muted-foreground">No project mounted yet</span>
          <MountProjectAction
            sessionId={session.id}
            workspaceId={session.workspaceId}
            presentation="button"
          />
        </div>
      ) : (
        groups.map((group) => (
          <ProjectMountGroup
            key={group.projectId}
            sessionId={session.id}
            group={group}
            diffStats={diffStats}
            worktreeStatuses={worktreeStatuses}
            pendingWorktrees={pendingWorktrees}
            onSelectLens={onSelectLens}
          />
        ))
      )}
      <MountCleanupProposals sessionId={session.id} />
    </section>
  );
};
