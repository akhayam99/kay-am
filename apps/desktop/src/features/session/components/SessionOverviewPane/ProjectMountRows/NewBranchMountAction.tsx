import { useState } from 'react';
import { GitFork } from 'lucide-react';
import { AnchoredPopover, Button, Input, Tooltip, cn, formatError, useDropdown } from '@goodboy/ui';
import type { ProjectId, SessionId } from '@goodboy/types';
import { useToast } from '../../../../../app/components/Toast';
import { useAppStore } from '../../../../../store';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly presentation?: 'icon' | 'button';
  readonly triggerClassName?: string;
};

export const NewBranchMountAction = ({
  sessionId,
  projectId,
  projectName,
  presentation = 'button',
  triggerClassName,
}: Props) => {
  const dropdown = useDropdown({ align: 'end', width: 'w-80', expectedHeight: 190 });
  const forkMount = useAppStore((state) => state.forkMount);
  const { showToast } = useToast();
  const [branch, setBranch] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const create = async () => {
    setIsBusy(true);
    try {
      const trimmed = branch.trim();
      await forkMount({ sessionId, projectId, ...(trimmed === '' ? {} : { branch: trimmed }) });
      setBranch('');
      dropdown.close();
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel={`New branch mount in ${projectName}`}
      trigger={
        <Tooltip content={`Add another branch mount of ${projectName}`}>
          <button
            type="button"
            aria-label={`New branch mount in ${projectName}`}
            aria-haspopup="dialog"
            aria-expanded={dropdown.open}
            onClick={() => dropdown.toggle()}
            className={cn(
              triggerClassName ??
                'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-2xs text-muted-foreground motion-safe:transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
            )}
          >
            <GitFork size={ICON_SIZE.row} aria-hidden />
            {presentation === 'button' ? <span>New branch mount</span> : null}
          </button>
        </Tooltip>
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">
            {`New branch mount in ${projectName}`}
          </span>
          <span className="text-2xs text-muted-foreground">
            It gets its own worktree. The mounts already here keep their branches and requests.
          </span>
        </div>
        <Input
          value={branch}
          autoFocus
          disabled={isBusy}
          aria-label="Branch name"
          placeholder="Leave empty to name it automatically"
          onChange={(event) => setBranch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') {
              return;
            }
            event.preventDefault();
            void create();
          }}
          className="h-8 w-full text-xs"
        />
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" disabled={isBusy} onClick={() => dropdown.close()}>
            Cancel
          </Button>
          <Button size="sm" disabled={isBusy} onClick={() => void create()}>
            {isBusy ? 'Creating…' : 'Create mount'}
          </Button>
        </div>
      </div>
    </AnchoredPopover>
  );
};
