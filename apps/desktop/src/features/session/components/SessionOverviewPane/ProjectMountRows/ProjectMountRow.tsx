import { useState } from 'react';
import { Chip, cn, Skeleton, Tooltip, formatError } from '@goodboy/ui';
import type { SessionId, WorkspaceId, WorktreeStatus } from '@goodboy/types';
import type { LensKind, MountDiffStat } from '../../../../../store';
import { useAppStore } from '../../../../../store';
import type { MountRowView } from '../../../../../store/slices/project-mounts/mountRowModel';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { useToast } from '../../../../../app/components/Toast';
import { useMountRemoteHostKind } from '../../../../worktree/useMountRemoteHostKind';
import { PullRequestChip } from '../../../../github/components/PullRequestChip';
import { DiffStat } from '../../DiffStat';
import { EditorMenu } from '../EditorMenu';
import { MountBranchDecision } from './MountBranchDecision';
import { MountRequestAction } from './MountRequestAction';
import { MountRequestLink } from './MountRequestLink';
import { ProjectBranchChip } from './ProjectBranchChip';
import { ProjectSyncControl } from './ProjectSyncControl';
import { ProjectDetachMenu } from './ProjectDetachMenu';
import { useProjectActivity } from './useProjectActivity';

type Props = {
  readonly sessionId: SessionId;
  readonly row: MountRowView;
  readonly label: string;
  readonly workspaceId: WorkspaceId | null;
  readonly diffStat: MountDiffStat | null;
  readonly worktreeStatus: WorktreeStatus | null;
  readonly isStatusPending?: boolean;
  readonly onSelectLens: (lens: LensKind) => void;
};

const ICON_BUTTON =
  'relative inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]';

const SLOT_POSITION = 'flex w-10 shrink-0 items-center';
const SLOT_BRANCH = 'flex min-w-0 flex-1 items-center';
const SLOT_SYNC = 'flex w-7 shrink-0 items-center justify-center';
const SLOT_DIFF = 'flex w-28 shrink-0 items-center';
const SLOT_STATE = 'flex w-28 shrink-0 items-center';
const SLOT_REQUEST = 'flex w-14 shrink-0 items-center';
const SLOT_ACTION = 'flex w-20 shrink-0 items-center';
const SLOT_TOOLS =
  'flex w-24 shrink-0 items-center justify-end opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';
const SLOT_MENU = 'flex w-7 shrink-0 items-center justify-center';

const ACTIVITY_DOT = 'absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-success';

type SuffixParams = {
  readonly count: number;
};

const runningSuffix = ({ count }: SuffixParams) => (count > 0 ? `, ${count} running` : '');

export const ProjectMountRow = ({
  sessionId,
  row,
  label,
  workspaceId,
  diffStat,
  worktreeStatus,
  isStatusPending: isStatusPendingProp = false,
  onSelectLens,
}: Props) => {
  const setSessionActiveMount = useAppStore((state) => state.setSessionActiveMount);
  const setScriptsLensScope = useAppStore((state) => state.setScriptsLensScope);
  const openMountDiff = useAppStore((state) => state.openMountDiff);
  const attachMount = useAppStore((state) => state.attachMount);
  const { showToast } = useToast();
  const [isAttaching, setIsAttaching] = useState(false);
  const isRepo = row.projectKind === 'repo';
  const worktreePath = row.worktreePath;
  const changes = diffStat != null && (diffStat.additions > 0 || diffStat.deletions > 0);
  const isStatusPending = isStatusPendingProp && worktreeStatus == null && isRepo;
  const remoteKind = useMountRemoteHostKind({ sessionId, repoRoot: row.repoRoot });
  const activity = useProjectActivity({
    sessionId,
    projectId: row.projectId,
    workspaceId,
  });
  const observation = row.observation;
  const hasTools = row.isAttached && worktreePath !== null;

  const openLens = async ({ lens }: { readonly lens: LensKind }) => {
    await setSessionActiveMount({ sessionId, mountId: row.mountId }).catch(() => undefined);
    if (lens === 'scripts') {
      setScriptsLensScope({ scope: { projectId: row.projectId } });
    }
    onSelectLens(lens);
  };

  const mount = async () => {
    setIsAttaching(true);
    try {
      await attachMount({ sessionId, mountId: row.mountId });
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <li
      data-testid="project-mount-row"
      aria-label={label}
      className="group flex w-full flex-col border-b border-border-soft last:border-b-0"
    >
      <div className="flex min-h-10 w-full items-center gap-2 px-3 py-1.5">
        <div className={SLOT_POSITION}>
          {row.series === null ? null : (
            <Tooltip content={`Part ${row.series.label} of ${row.series.name}`}>
              <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
                {row.series.label}
              </span>
            </Tooltip>
          )}
        </div>
        <div className={SLOT_BRANCH}>
          {isStatusPending && row.branch === '' ? (
            <span data-testid="project-branch-skeleton" className="shrink-0">
              <Skeleton className="h-6 w-28 rounded-md" />
            </span>
          ) : (
            <ProjectBranchChip
              sessionId={sessionId}
              projectId={row.projectId}
              mountId={row.mountId}
              branch={row.branch}
              canSwitch={isRepo && row.isAttached}
            />
          )}
        </div>
        <div className={SLOT_SYNC}>
          {isRepo && row.isAttached ? (
            isStatusPending ? (
              <span data-testid="project-distance-skeleton" className="shrink-0">
                <Skeleton className="size-7 rounded-md" />
              </span>
            ) : (
              <ProjectSyncControl
                sessionId={sessionId}
                projectId={row.projectId}
                mountId={row.mountId}
                status={worktreeStatus}
              />
            )
          ) : null}
        </div>
        <div className={SLOT_DIFF}>
          {!row.isAttached ? null : changes && worktreePath !== null ? (
            <Tooltip content={`View changes in ${label}`}>
              <button
                type="button"
                aria-label={`View the changes of ${label}`}
                onClick={() => openMountDiff(sessionId, worktreePath)}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs tabular-nums hover:bg-muted/40"
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
            <span className="px-1.5 text-xs text-muted-foreground/50">No changes</span>
          )}
        </div>
        <div className={SLOT_STATE}>
          {row.isAttached ? (
            row.request === null ? null : (
              <PullRequestChip
                state={row.request.isDraft ? 'draft' : row.request.state}
                variant="badge"
                iconSize={9}
              />
            )
          ) : (
            <Chip
              tone="neutral"
              size="3xs"
              uppercase
              bordered={false}
              icon={<CONCEPT_ICONS.worktree size={9} aria-hidden />}
              label={row.isOnDisk ? 'Worktree kept' : 'Unmounted'}
              title={
                row.isOnDisk
                  ? 'Unmounted, its worktree is still on disk'
                  : 'Unmounted, its worktree is gone'
              }
              className="shrink-0"
            />
          )}
        </div>
        <div className={SLOT_REQUEST}>
          <MountRequestLink sessionId={sessionId} row={row} label={label} />
        </div>
        <div className={SLOT_ACTION}>
          {row.isAttached ? (
            <MountRequestAction
              sessionId={sessionId}
              row={row}
              label={label}
              hasChanges={changes}
              remoteKind={remoteKind}
            />
          ) : (
            <button
              type="button"
              disabled={isAttaching}
              aria-label={`Mount ${label}`}
              onClick={() => void mount()}
              className={cn(
                'shrink-0 rounded-md border border-border-soft px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isAttaching ? 'Mounting…' : 'Mount'}
            </button>
          )}
        </div>
        <div className={SLOT_TOOLS}>
          {!hasTools || worktreePath === null ? null : (
            <>
              <EditorMenu
                sessionId={sessionId}
                density="compact"
                target={{ name: label, worktreePath }}
                triggerClassName={ICON_BUTTON}
              />
              <Tooltip
                content={`Open terminal in ${label}${runningSuffix({ count: activity.liveTerminals })}`}
              >
                <button
                  type="button"
                  aria-label={`Open terminal for ${label}`}
                  onClick={() => void openLens({ lens: 'terminal' })}
                  className={ICON_BUTTON}
                >
                  <CONCEPT_ICONS.terminal size={ICON_SIZE.row} aria-hidden />
                  {activity.liveTerminals > 0 ? (
                    <span
                      data-testid="terminal-activity-dot"
                      aria-hidden
                      className={ACTIVITY_DOT}
                    />
                  ) : null}
                </button>
              </Tooltip>
              <Tooltip
                content={`Open scripts for ${label}${runningSuffix({ count: activity.runningScripts })}`}
              >
                <button
                  type="button"
                  aria-label={`Open scripts for ${label}`}
                  onClick={() => void openLens({ lens: 'scripts' })}
                  className={ICON_BUTTON}
                >
                  <CONCEPT_ICONS.scripts size={ICON_SIZE.row} aria-hidden />
                  {activity.runningScripts > 0 ? (
                    <span data-testid="scripts-activity-dot" aria-hidden className={ACTIVITY_DOT} />
                  ) : null}
                </button>
              </Tooltip>
            </>
          )}
        </div>
        <div className={SLOT_MENU}>
          <ProjectDetachMenu
            sessionId={sessionId}
            projectId={row.projectId}
            workspaceId={workspaceId ?? undefined}
            projectName={row.projectName}
            menuLabel={`${label} actions`}
            worktreePath={worktreePath ?? row.lastWorktreePath ?? ''}
            worktreeStatus={worktreeStatus}
            triggerClassName={ICON_BUTTON}
            {...(row.isAttached ? { mountId: row.mountId } : {})}
            branch={row.branch}
            canDetachProject={false}
          />
        </div>
      </div>
      {observation === null ? null : (
        <div className="flex flex-col px-3 pb-2">
          <MountBranchDecision
            sessionId={sessionId}
            mountId={row.mountId}
            observation={observation}
          />
        </div>
      )}
    </li>
  );
};
