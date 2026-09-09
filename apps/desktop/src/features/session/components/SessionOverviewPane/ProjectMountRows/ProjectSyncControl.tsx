import { useState } from 'react';
import { ArrowDown, ArrowUp, GitBranch, RefreshCw, Upload } from 'lucide-react';
import {
  AnchoredPopover,
  IconButton,
  cn,
  formatError,
  tintClasses,
  useDropdown,
} from '@goodboy/ui';
import type { MountId, ProjectId, SessionId, WorktreeStatus } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import { distanceAhead } from '../../../../../shared/lib/gitStatus';
import { BaseBranchSelect } from '../../../../worktree/BaseBranchSelect';
import { useRebaseAgent } from '../../../hooks/useRebaseAgent';
import { usePushBranch } from '../../../hooks/usePushBranch';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly mountId?: MountId;
  readonly status: WorktreeStatus | null;
};

type CommitBaseBranchParams = {
  readonly candidate: string | null;
};

type NotifyParams = {
  readonly title: string;
  readonly message: string;
};

type TargetProjectParams = {
  readonly action: () => Promise<void>;
};

export const ProjectSyncControl = ({ sessionId, projectId, mountId, status }: Props) => {
  const dropdown = useDropdown({ width: 'w-64', expectedHeight: 160 });
  const setSessionActiveProject = useAppStore((state) => state.setSessionActiveProject);
  const emitNotification = useAppStore((state) => state.emitNotification);
  const configuredBaseBranch = useAppStore(
    (state) => state.projects.find((project) => project.id === projectId)?.baseBranch ?? null,
  );
  const repoPath = useAppStore(
    (state) => state.projects.find((project) => project.id === projectId)?.rootPath ?? '',
  );
  const updateProjectBaseBranch = useAppStore((state) => state.updateProjectBaseBranch);
  const [baseError, setBaseError] = useState<string | null>(null);
  const baseBranch = configuredBaseBranch ?? 'main';
  const notify = ({ title, message }: NotifyParams) => {
    void emitNotification('error', 'error', title, message, { sessionId });
  };
  const rebase = useRebaseAgent({
    sessionId,
    status,
    onError: (message) => notify({ title: 'Rebase failed', message }),
  });
  const push = usePushBranch({
    sessionId,
    onError: (message) => notify({ title: 'Push failed', message }),
  });

  const distance = status?.mainDistance.kind === 'known' ? status.mainDistance : null;
  const upstreamAhead =
    status == null ? null : distanceAhead({ distance: status.upstreamDistance });
  const canPush = upstreamAhead != null && upstreamAhead > 0;
  const targetProject = async ({ action }: TargetProjectParams) => {
    await setSessionActiveProject({
      sessionId,
      projectId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    await action();
  };
  const commitBaseBranch = async ({ candidate }: CommitBaseBranchParams) => {
    const value = candidate?.trim() ?? '';
    const next = value === '' ? null : value;
    if (next === (configuredBaseBranch ?? null)) {
      setBaseError(null);
      return;
    }
    try {
      await updateProjectBaseBranch({ projectId, baseBranch: next });
      setBaseError(null);
    } catch (error) {
      setBaseError(formatError(error));
    }
  };

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="menu"
      ariaLabel="Branch sync actions"
      anchorClassName="shrink-0"
      trigger={
        <span className="relative inline-flex shrink-0">
          <IconButton
            variant="ghost"
            icon={RefreshCw}
            iconSize={ICON_SIZE.row}
            label="Branch sync actions"
            aria-haspopup="menu"
            aria-expanded={dropdown.open}
            onClick={dropdown.toggle}
            className="size-7"
          />
          {distance != null && distance.behind > 0 ? (
            <span
              data-testid="project-behind-badge"
              className={cn(
                'pointer-events-none absolute -right-1 -top-1 flex min-w-3.5 items-center justify-center rounded-full px-1 text-3xs font-semibold leading-3.5',
                tintClasses('warning').solid,
              )}
            >
              {distance.behind}
            </span>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col py-1">
        <div className="flex flex-col gap-1 border-b border-border-soft px-3 py-2 text-xs tabular-nums text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="font-medium text-foreground">Compared with</span>
              <BaseBranchSelect
                repoPath={repoPath}
                value={configuredBaseBranch}
                disabled={repoPath === ''}
                onCommit={(candidate) => commitBaseBranch({ candidate })}
              />
            </div>
            <span className="flex items-center gap-1">
              <ArrowDown size={11} aria-hidden />
              {distance?.behind ?? '--'}
            </span>
            <span className="flex items-center gap-1">
              <ArrowUp size={11} aria-hidden />
              {distance?.ahead ?? '--'}
            </span>
          </div>
          {baseError == null ? null : <span className="text-2xs text-danger">{baseError}</span>}
        </div>
        <button
          type="button"
          disabled={!rebase.canRebase || rebase.isRunning}
          onClick={() =>
            void targetProject({
              action: () =>
                rebase.run({ projectId, ...(mountId === undefined ? {} : { mountId }) }),
            })
          }
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40',
            (!rebase.canRebase || rebase.isRunning) && 'opacity-40',
          )}
        >
          <GitBranch size={ICON_SIZE.row} aria-hidden />
          {rebase.isRunning ? `Rebasing on ${baseBranch}` : `Rebase on ${baseBranch}`}
        </button>
        <button
          type="button"
          disabled={!canPush || push.isBusy}
          onClick={() => void targetProject({ action: push.run })}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40',
            (!canPush || push.isBusy) && 'opacity-40',
          )}
        >
          <Upload size={ICON_SIZE.row} aria-hidden />
          {push.isBusy ? 'Pushing branch' : 'Push branch'}
        </button>
      </div>
    </AnchoredPopover>
  );
};
