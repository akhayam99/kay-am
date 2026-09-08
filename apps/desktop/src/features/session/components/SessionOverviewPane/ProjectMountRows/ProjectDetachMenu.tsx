import { useState } from 'react';
import { AnchoredPopover, Button, Tooltip, formatError, useDropdown } from '@goodboy/ui';
import type { MountId, ProjectId, SessionId, WorktreeStatus, WorkspaceId } from '@goodboy/types';
import { useToast } from '../../../../../app/components/Toast';
import { useAppStore } from '../../../../../store';
import { isWorkingTreeClean } from '../../../../../shared/lib/gitStatus';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly workspaceId: WorkspaceId | undefined;
  readonly projectName: string;
  readonly worktreePath: string;
  readonly worktreeStatus: WorktreeStatus | null;
  readonly triggerClassName: string;
  readonly mountId?: MountId;
  readonly branch?: string;
  readonly menuLabel?: string;
  readonly canDetachProject?: boolean;
};

type Confirming = 'detach' | 'unmount' | null;

export const ProjectDetachMenu = ({
  sessionId,
  projectId,
  workspaceId,
  projectName,
  worktreePath,
  worktreeStatus,
  triggerClassName,
  mountId,
  branch = '',
  menuLabel,
  canDetachProject = true,
}: Props) => {
  const dropdown = useDropdown({ align: 'end', width: 'w-72', expectedHeight: 190 });
  const detachProject = useAppStore((state) => state.detachProject);
  const unmountMount = useAppStore((state) => state.unmountMount);
  const emitNotification = useAppStore((state) => state.emitNotification);
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isClean =
    worktreeStatus != null && isWorkingTreeClean({ workingTree: worktreeStatus.workingTree });
  const label = menuLabel ?? `${projectName} actions`;

  const fail = (title: string, error: unknown) => {
    void emitNotification('error', 'warning', title, formatError(error), {
      sessionId,
      workspaceId,
    });
  };

  const detach = async () => {
    setIsBusy(true);
    try {
      await detachProject({ sessionId, projectId });
      dropdown.close();
      setConfirming(null);
      if (!isClean) {
        showToast('info', `Worktree kept at ${worktreePath}`);
      }
    } catch (error) {
      fail('could not detach the project', error);
    } finally {
      setIsBusy(false);
    }
  };

  const unmount = async () => {
    if (mountId === undefined) {
      return;
    }
    setIsBusy(true);
    try {
      const result = await unmountMount({ sessionId, mountId });
      dropdown.close();
      setConfirming(null);
      if (result.kept) {
        showToast('info', `Worktree kept at ${worktreePath}`);
      }
    } catch (error) {
      fail('could not unmount the branch', error);
    } finally {
      setIsBusy(false);
    }
  };

  const keptNote = (
    <div className="flex min-w-0 flex-col gap-1 text-muted-foreground">
      <span className="text-2xs">Uncommitted changes stay on disk at</span>
      <span className="truncate font-mono text-2xs">{worktreePath}</span>
    </div>
  );

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="menu"
      ariaLabel={label}
      trigger={
        <Tooltip content={label} anchorClassName="shrink-0">
          <button
            type="button"
            onClick={() => {
              if (dropdown.open) {
                dropdown.close();
                setConfirming(null);
                return;
              }
              dropdown.toggle();
            }}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={dropdown.open}
            className={triggerClassName}
          >
            <CONCEPT_ICONS.more size={ICON_SIZE.control} aria-hidden />
          </button>
        </Tooltip>
      }
    >
      {confirming === 'unmount' ? (
        <div className="flex w-72 flex-col gap-2 p-3">
          <span className="text-xs font-medium">
            {branch === '' ? 'Unmount this branch?' : `Unmount ${branch}?`}
          </span>
          {isClean ? (
            <span className="text-2xs text-muted-foreground">
              Its worktree is removed. The branch and any pull request stay.
            </span>
          ) : (
            keptNote
          )}
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => void unmount()}>
              {isClean ? 'Unmount' : 'Unmount, keep changes'}
            </Button>
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {confirming === 'detach' ? (
        <div className="flex w-72 flex-col gap-2 p-3">
          <span className="text-xs font-medium">{`Detach ${projectName}?`}</span>
          {isClean ? (
            <span className="text-2xs text-muted-foreground">
              Its worktree is clean and will be removed.
            </span>
          ) : (
            keptNote
          )}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={isBusy}
              onClick={() => void detach()}
            >
              {isClean ? 'Detach' : 'Detach, keep changes'}
            </Button>
            <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {confirming === null ? (
        <div className="flex flex-col">
          {mountId === undefined ? null : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming('unmount')}
              className="flex w-full items-center px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
            >
              Unmount branch
            </button>
          )}
          {canDetachProject ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming('detach')}
              className="flex w-full items-center px-2.5 py-1.5 text-left text-danger/90 transition-colors hover:bg-danger/10 hover:text-danger"
            >
              Detach project
            </button>
          ) : null}
        </div>
      ) : null}
    </AnchoredPopover>
  );
};
