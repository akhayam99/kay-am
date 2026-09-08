import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Session, SessionProjectMount } from '@goodboy/types';
import type { LensKind } from '../../../../../store';
import { EMPTY_ARRAY, useAppStore, useMountDiffStats } from '../../../../../store';
import { MountCleanupProposals } from '../MountCleanupProposals';
import { MountProjectAction } from './MountProjectAction';
import { ProjectMountRow } from './ProjectMountRow';
import { useWorktreeStatusPending, useWorktreeStatuses } from '../../../hooks/useWorktreeStatuses';

type Props = {
  readonly session: Session;
  readonly onSelectLens: (lens: LensKind) => void;
};

export const ProjectMountRows = ({ session, onSelectLens }: Props) => {
  const mounts = useAppStore(
    (state) =>
      state.sessionProjectMounts[session.id] ?? (EMPTY_ARRAY as ReadonlyArray<SessionProjectMount>),
  );
  const projects = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => project.workspaceId === session.workspaceId),
    ),
  );
  const projectPrs = useAppStore((state) => state.sessionProjectPrs?.[session.id]);
  const diffStats = useMountDiffStats(session.id);
  const worktreeTargets = useMemo(
    () =>
      mounts.map((mount) => ({
        worktreePath: mount.worktreePath,
        baseBranch:
          projects.find((project) => project.id === mount.projectId)?.baseBranch ?? undefined,
      })),
    [mounts, projects],
  );
  const worktreeStatuses = useWorktreeStatuses({ targets: worktreeTargets });
  const pendingWorktrees = useWorktreeStatusPending({ targets: worktreeTargets });

  return (
    <section
      aria-label="Mounted projects"
      className="overflow-hidden rounded-lg border border-border-soft bg-elevated/30"
    >
      {mounts.length === 0 ? (
        <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
          <span className="text-sm text-muted-foreground">No project mounted yet</span>
          <MountProjectAction
            sessionId={session.id}
            workspaceId={session.workspaceId}
            presentation="button"
          />
        </div>
      ) : (
        mounts.map((mount) => (
          <ProjectMountRow
            key={mount.projectId}
            sessionId={session.id}
            project={projects.find((project) => project.id === mount.projectId) ?? null}
            mount={mount}
            diffStat={diffStats.get(mount.worktreePath) ?? null}
            pullRequest={projectPrs?.[mount.projectId]?.[0] ?? null}
            worktreeStatus={worktreeStatuses.get(mount.worktreePath) ?? null}
            isStatusPending={pendingWorktrees.has(mount.worktreePath)}
            onSelectLens={onSelectLens}
          />
        ))
      )}
      <MountCleanupProposals sessionId={session.id} />
    </section>
  );
};
