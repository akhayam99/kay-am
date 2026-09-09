import { useEffect, useMemo } from 'react';
import { SectionHeader } from '@goodboy/ui';
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
    <section aria-label="Mounted projects" className="flex min-w-0 flex-col gap-2">
      <SectionHeader
        label="Projects"
        action={<MountProjectAction sessionId={session.id} workspaceId={session.workspaceId} />}
      />
      {groups.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <ProjectMountGroup
              key={group.projectId}
              sessionId={session.id}
              group={group}
              diffStats={diffStats}
              worktreeStatuses={worktreeStatuses}
              pendingWorktrees={pendingWorktrees}
              onSelectLens={onSelectLens}
            />
          ))}
        </div>
      )}
      <MountCleanupProposals sessionId={session.id} />
    </section>
  );
};
