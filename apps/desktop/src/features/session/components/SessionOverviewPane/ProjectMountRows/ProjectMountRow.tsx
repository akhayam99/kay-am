import { cn, Skeleton, Tooltip } from '@goodboy/ui';
import type {
  Project,
  PullRequestState,
  SessionId,
  SessionProjectMount,
  WorktreeStatus,
} from '@goodboy/types';
import type { LensKind, MountDiffStat } from '../../../../../store';
import { useAppStore } from '../../../../../store';
import {
  CONCEPT_ICONS,
  ICON_SIZE,
  projectGlyph,
} from '../../../../../shared/components/conceptIcons';
import { PullRequestChip } from '../../../../github/components/PullRequestChip';
import { usePrDraftAgentRunning } from '../../../../github/usePrDraftAgentRunning';
import { useRemoteHostKind } from '../../../../worktree/useRemoteHostKind';
import { DiffStat } from '../../DiffStat';
import { EditorMenu } from '../EditorMenu';
import { ProjectBranchChip } from './ProjectBranchChip';
import { ProjectSyncControl } from './ProjectSyncControl';
import { ProjectDetachMenu } from './ProjectDetachMenu';
import { useProjectActivity } from './useProjectActivity';

type Props = {
  readonly sessionId: SessionId;
  readonly project: Project | null;
  readonly mount: SessionProjectMount;
  readonly diffStat: MountDiffStat | null;
  readonly pullRequest: PullRequestState | null;
  readonly worktreeStatus: WorktreeStatus | null;
  readonly isStatusPending?: boolean;
  readonly onSelectLens: (lens: LensKind) => void;
};

const ICON_BUTTON =
  'relative inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]';

const ACTIVITY_DOT = 'absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-success';

type SuffixParams = {
  readonly count: number;
};

const runningSuffix = ({ count }: SuffixParams) => (count > 0 ? `, ${count} running` : '');

export const ProjectMountRow = ({
  sessionId,
  project,
  mount,
  diffStat,
  pullRequest,
  worktreeStatus,
  isStatusPending: isStatusPendingProp = false,
  onSelectLens,
}: Props) => {
  const setSessionActiveProject = useAppStore((state) => state.setSessionActiveProject);
  const setScriptsLensScope = useAppStore((state) => state.setScriptsLensScope);
  const openMountDiff = useAppStore((state) => state.openMountDiff);
  const GlyphIcon = projectGlyph({ kind: project?.kind });
  const projectName = project?.name ?? mount.mountName;
  const changes = diffStat != null && (diffStat.additions > 0 || diffStat.deletions > 0);
  const isStatusPending = isStatusPendingProp && worktreeStatus == null && project?.kind === 'repo';
  const remoteKind = useRemoteHostKind({ sessionId });
  const isDraftAgentRunning = usePrDraftAgentRunning({ sessionId });
  const isCreateBlocked = remoteKind !== 'gitlab' && isDraftAgentRunning;
  const activity = useProjectActivity({
    sessionId,
    projectId: mount.projectId,
    workspaceId: project?.workspaceId ?? null,
  });

  const openLens = async ({ lens }: { readonly lens: LensKind }) => {
    await setSessionActiveProject({ sessionId, projectId: mount.projectId });
    if (lens === 'scripts') {
      setScriptsLensScope({ scope: { projectId: mount.projectId } });
    }
    onSelectLens(lens);
  };
  return (
    <div
      data-testid="project-mount-row"
      className="flex min-h-10 w-full items-center gap-3 border-b border-border-soft px-3 py-1.5 last:border-b-0"
    >
      <div className="flex min-w-36 flex-1 items-center gap-2">
        <GlyphIcon
          size={ICON_SIZE.control}
          aria-hidden
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate text-sm font-medium text-foreground">{projectName}</span>
      </div>
      {isStatusPending && mount.branch === '' ? (
        <span data-testid="project-branch-skeleton" className="shrink-0">
          <Skeleton className="h-6 w-28 rounded-md" />
        </span>
      ) : (
        <ProjectBranchChip
          sessionId={sessionId}
          projectId={mount.projectId}
          branch={mount.branch}
          canSwitch={project?.kind === 'repo'}
        />
      )}
      {project?.kind === 'repo' ? (
        isStatusPending ? (
          <span data-testid="project-distance-skeleton" className="shrink-0">
            <Skeleton className="size-7 rounded-md" />
          </span>
        ) : (
          <ProjectSyncControl
            sessionId={sessionId}
            projectId={mount.projectId}
            status={worktreeStatus}
          />
        )
      ) : null}
      {changes ? (
        <Tooltip content={`View changes in ${projectName}`}>
          <button
            type="button"
            aria-label={`View the changes of ${projectName}`}
            onClick={() => openMountDiff(sessionId, mount.worktreePath)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs tabular-nums hover:bg-muted/40"
          >
            <CONCEPT_ICONS.diff
              size={ICON_SIZE.row}
              aria-hidden
              className="shrink-0 text-muted-foreground"
            />
            <DiffStat
              additions={diffStat.additions}
              deletions={diffStat.deletions}
              size="inherit"
            />
          </button>
        </Tooltip>
      ) : (
        <span className="text-xs text-muted-foreground/50">No changes</span>
      )}
      {pullRequest == null && changes && remoteKind != null ? (
        <button
          type="button"
          disabled={isCreateBlocked}
          aria-label={
            isCreateBlocked
              ? `An agent is opening a PR for ${projectName}`
              : `Create a PR for ${projectName}`
          }
          onClick={() => {
            void setSessionActiveProject({ sessionId, projectId: mount.projectId }).then(() => {
              window.dispatchEvent(
                new CustomEvent(
                  remoteKind === 'gitlab'
                    ? 'goodboy:open-gitlab-mr'
                    : 'goodboy:open-github-session',
                  { detail: { sessionId } },
                ),
              );
            });
          }}
          className={cn(
            'rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
          )}
        >
          {remoteKind === 'gitlab' ? 'Create MR' : isCreateBlocked ? 'Opening PR…' : 'Create PR'}
        </button>
      ) : null}
      {pullRequest != null ? (
        <button
          type="button"
          aria-label={`Open PR #${pullRequest.number}`}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('goodboy:open-github-session', {
                detail: { sessionId, prNumber: pullRequest.number },
              }),
            )
          }
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted/40"
        >
          <PullRequestChip
            state={pullRequest.isDraft ? 'draft' : pullRequest.state}
            variant="badge"
            iconSize={9}
          />
          <span className="font-mono">#{pullRequest.number}</span>
        </button>
      ) : null}
      <EditorMenu
        sessionId={sessionId}
        density="compact"
        target={{ name: projectName, worktreePath: mount.worktreePath }}
        triggerClassName={ICON_BUTTON}
      />
      <Tooltip
        content={`Open terminal in ${projectName}${runningSuffix({ count: activity.liveTerminals })}`}
      >
        <button
          type="button"
          aria-label={`Open terminal for ${projectName}`}
          onClick={() => void openLens({ lens: 'terminal' })}
          className={ICON_BUTTON}
        >
          <CONCEPT_ICONS.terminal size={ICON_SIZE.row} aria-hidden />
          {activity.liveTerminals > 0 ? (
            <span data-testid="terminal-activity-dot" aria-hidden className={ACTIVITY_DOT} />
          ) : null}
        </button>
      </Tooltip>
      <Tooltip
        content={`Open scripts for ${projectName}${runningSuffix({ count: activity.runningScripts })}`}
      >
        <button
          type="button"
          aria-label={`Open scripts for ${projectName}`}
          onClick={() => void openLens({ lens: 'scripts' })}
          className={ICON_BUTTON}
        >
          <CONCEPT_ICONS.scripts size={ICON_SIZE.row} aria-hidden />
          {activity.runningScripts > 0 ? (
            <span data-testid="scripts-activity-dot" aria-hidden className={ACTIVITY_DOT} />
          ) : null}
        </button>
      </Tooltip>
      <ProjectDetachMenu
        sessionId={sessionId}
        projectId={mount.projectId}
        workspaceId={project?.workspaceId}
        projectName={projectName}
        worktreePath={mount.worktreePath}
        worktreeStatus={worktreeStatus}
        triggerClassName={ICON_BUTTON}
      />
    </div>
  );
};
