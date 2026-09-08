import { useEffect } from 'react';
import { Check, GitBranch, Pencil } from 'lucide-react';
import { AnchoredPopover, Tooltip, cn, useCopyLink, useDropdown } from '@goodboy/ui';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';
import { useToast } from '../../../../../app/components/Toast';
import { useAppStore } from '../../../../../store';
import { BranchSwitchPanel } from '../../../../worktree/BranchSwitchPanel';
import { VITAL_CHIP_FOCUS, VITAL_CHIP_FRAME, VITAL_CHIP_HOVER } from '../vitalChip';

type Props = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly mountId?: MountId;
  readonly branch: string;
  readonly canSwitch: boolean;
};

export const ProjectBranchChip = ({ sessionId, projectId, mountId, branch, canSwitch }: Props) => {
  const { showToast } = useToast();
  const { copied, failed, copy } = useCopyLink();
  const setSessionActiveProject = useAppStore((state) => state.setSessionActiveProject);
  const dropdown = useDropdown({ width: 'w-96', expectedHeight: 360 });

  useEffect(() => {
    if (copied) {
      showToast('success', 'branch copied');
    }
  }, [copied, showToast]);

  useEffect(() => {
    if (failed) {
      showToast('error', 'copy failed');
    }
  }, [failed, showToast]);

  if (branch === '') {
    return null;
  }

  const openSwitch = async () => {
    await setSessionActiveProject({
      sessionId,
      projectId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    dropdown.toggle();
  };

  return (
    <span
      className={cn(
        VITAL_CHIP_FRAME,
        copied ? 'border-success/30 bg-success/10 text-success' : VITAL_CHIP_HOVER,
      )}
    >
      <Tooltip content={copied ? 'Copied' : 'Copy the branch name'}>
        <button
          type="button"
          onClick={() => void copy(branch)}
          aria-label={`Copy branch ${branch}`}
          className={cn(
            'inline-flex h-full min-w-0 items-center gap-1.5 rounded-md px-2',
            VITAL_CHIP_FOCUS,
          )}
        >
          {copied ? <Check size={11} aria-hidden /> : <GitBranch size={11} aria-hidden />}
          <span className="max-w-40 truncate font-mono">{branch}</span>
        </button>
      </Tooltip>
      {canSwitch ? (
        <AnchoredPopover
          dropdown={dropdown}
          role="dialog"
          ariaLabel="Switch branch"
          trigger={
            <Tooltip content="Switch branch">
              <button
                type="button"
                aria-label="Switch branch"
                aria-haspopup="dialog"
                aria-expanded={dropdown.open}
                onClick={() => void openSwitch()}
                className={cn(
                  'inline-flex h-full items-center rounded-md px-1.5 text-muted-foreground hover:text-foreground',
                  VITAL_CHIP_FOCUS,
                )}
              >
                <Pencil size={10} aria-hidden />
              </button>
            </Tooltip>
          }
        >
          <BranchSwitchPanel sessionId={sessionId} onDone={dropdown.close} />
        </AnchoredPopover>
      ) : null}
    </span>
  );
};
