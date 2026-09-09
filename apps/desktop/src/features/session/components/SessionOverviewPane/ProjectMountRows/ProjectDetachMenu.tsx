import { useEffect, useRef, useState } from 'react';
import { AnchoredPopover, Button, IconButton, cn, formatError, useDropdown } from '@goodboy/ui';
import type {
  MountId,
  ProjectId,
  SessionId,
  WorktreeDetachAssessment,
  WorktreeStatus,
  WorkspaceId,
} from '@goodboy/types';
import { useToast } from '../../../../../app/components/Toast';
import { useAppStore } from '../../../../../store';
import { isWorkingTreeClean } from '../../../../../shared/lib/gitStatus';
import { worktreeDetachAssessment } from '../../../../worktree/worktree';
import { mountCleanupBlockers } from '../../../../../store/slices/mount-cleanup/cleanupPolicy';
import type { DetachDisposition } from '../../../../../store/slices/project-mounts/detachProject';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { DetachConfirm } from './DetachConfirm';
import {
  REMOVAL_STAGE,
  buildDetachPlan,
  detachOutcomeMessage,
  summarizeDetachOutcomes,
} from './detachPlan';

type Props = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly workspaceId: WorkspaceId | undefined;
  readonly projectName: string;
  readonly worktreePath: string;
  readonly worktreeStatus: WorktreeStatus | null;
  readonly triggerClassName?: string;
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
  const dropdown = useDropdown({ align: 'end', width: 'w-80', expectedHeight: 190 });
  const detachProject = useAppStore((state) => state.detachProject);
  const unmountMount = useAppStore((state) => state.unmountMount);
  const emitNotification = useAppStore((state) => state.emitNotification);
  const isRepoProject = useAppStore(
    (state) => state.projects.find((candidate) => candidate.id === projectId)?.kind === 'repo',
  );
  const isBlocked = useAppStore(
    (state) =>
      mountCleanupBlockers({
        state,
        sessionId,
        mountId: mountId ?? null,
        worktreePath,
      }).length > 0,
  );
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<WorktreeDetachAssessment | null>(null);
  const requestRef = useRef(0);
  const isClean =
    worktreeStatus != null && isWorkingTreeClean({ workingTree: worktreeStatus.workingTree });
  const label = menuLabel ?? `${projectName} actions`;

  const fail = (title: string, error: unknown) => {
    void emitNotification('error', 'warning', title, formatError(error), {
      sessionId,
      workspaceId,
    });
  };

  const assess = () => {
    const token = requestRef.current + 1;
    requestRef.current = token;
    setAssessment(null);
    if (!isRepoProject || isBlocked) {
      return;
    }
    if (worktreePath === '') {
      setAssessment({ kind: 'unavailable', path: worktreePath, branch: null });
      return;
    }
    void worktreeDetachAssessment({ worktreePath })
      .then((result) => {
        if (requestRef.current !== token) {
          return;
        }
        setAssessment(result);
      })
      .catch(() => {
        if (requestRef.current !== token) {
          return;
        }
        setAssessment({ kind: 'unavailable', path: worktreePath, branch: null });
      });
  };

  useEffect(() => {
    if (dropdown.open) {
      return;
    }
    requestRef.current = requestRef.current + 1;
    setConfirming(null);
    setAssessment(null);
    setStage(null);
  }, [dropdown.open]);

  const detach = async ({ disposition }: { readonly disposition: DetachDisposition }) => {
    setIsBusy(true);
    setStage(disposition === 'keep-files' ? null : REMOVAL_STAGE);
    try {
      const outcomes = await detachProject({ sessionId, projectId, disposition });
      const summary = summarizeDetachOutcomes({ outcomes });
      showToast(
        summary === 'failed' ? 'error' : 'info',
        detachOutcomeMessage({ kind: summary, projectName, worktreePath }),
      );
      if (summary === 'failed') {
        assess();
        return;
      }
      dropdown.close();
      setConfirming(null);
    } catch (error) {
      fail('could not detach the project', error);
    } finally {
      setIsBusy(false);
      setStage(null);
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
      anchorClassName="shrink-0"
      trigger={
        <IconButton
          variant="ghost"
          icon={CONCEPT_ICONS.more}
          iconSize={ICON_SIZE.row}
          label={label}
          onClick={() => {
            if (dropdown.open) {
              dropdown.close();
              setConfirming(null);
              return;
            }
            dropdown.toggle();
          }}
          aria-haspopup="menu"
          aria-expanded={dropdown.open}
          className={cn('size-7', triggerClassName, dropdown.open && 'opacity-100')}
        />
      }
    >
      {confirming === 'unmount' ? (
        <div className="flex flex-col gap-2 p-3">
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
        <DetachConfirm
          projectName={projectName}
          plan={buildDetachPlan({
            projectName,
            worktreePath,
            branch,
            isRepoProject,
            isBlocked,
            assessment,
          })}
          isBusy={isBusy}
          stage={stage}
          onConfirm={({ disposition }) => void detach({ disposition })}
          onRecheck={assess}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
      {confirming === null ? (
        <div className="flex flex-col">
          {mountId === undefined ? null : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setConfirming('unmount')}
              className="flex w-full items-center px-2.5 py-1.5 text-left motion-safe:transition-colors hover:bg-muted/40"
            >
              Unmount branch
            </button>
          )}
          {canDetachProject ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setConfirming('detach');
                assess();
              }}
              className="flex w-full items-center px-2.5 py-1.5 text-left text-danger/90 motion-safe:transition-colors hover:bg-danger/10 hover:text-danger"
            >
              Detach project
            </button>
          ) : null}
        </div>
      ) : null}
    </AnchoredPopover>
  );
};
