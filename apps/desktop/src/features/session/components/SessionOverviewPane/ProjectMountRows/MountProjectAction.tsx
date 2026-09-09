import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { AnchoredPopover, Button, IconButton, useDropdown } from '@goodboy/ui';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../../../../store';
import { MountProjectList } from './MountProjectList';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
  readonly presentation?: 'icon' | 'button';
};

const emptyPickerMessage = ({
  hasWorkspaceProjects,
}: {
  readonly hasWorkspaceProjects: boolean;
}): string =>
  hasWorkspaceProjects
    ? 'Every workspace project is already mounted.'
    : 'Add a project in workspace settings to mount it here.';

export const MountProjectAction = ({ sessionId, workspaceId, presentation = 'icon' }: Props) => {
  const dropdown = useDropdown({ width: 'w-80', expectedHeight: 320 });
  const [isComplete, setIsComplete] = useState(false);
  const availableProjects = useAppStore(
    useShallow((state) => {
      const mounts = state.sessionProjectMounts[sessionId] ?? [];
      return state.projects.filter(
        (project) =>
          project.workspaceId === workspaceId &&
          mounts.every((mount) => mount.projectId !== project.id),
      );
    }),
  );
  const hasWorkspaceProjects = useAppStore((state) =>
    state.projects.some((project) => project.workspaceId === workspaceId),
  );
  const label = 'Mount project';

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel={label}
      anchorClassName="shrink-0"
      trigger={
        presentation === 'icon' ? (
          <IconButton
            variant="ghost"
            icon={FolderPlus}
            iconSize={ICON_SIZE.row}
            label={label}
            aria-haspopup="dialog"
            aria-expanded={dropdown.open}
            onClick={() => {
              setIsComplete(false);
              dropdown.toggle();
            }}
            className="size-6 shrink-0"
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label={label}
            aria-haspopup="dialog"
            aria-expanded={dropdown.open}
            onClick={() => {
              setIsComplete(false);
              dropdown.toggle();
            }}
          >
            <FolderPlus size={ICON_SIZE.row} aria-hidden />
            {label}
          </Button>
        )
      }
    >
      {availableProjects.length === 0 || isComplete ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {emptyPickerMessage({ hasWorkspaceProjects })}
        </p>
      ) : (
        <MountProjectList
          sessionId={sessionId}
          projects={availableProjects}
          onDone={() => {
            setIsComplete(true);
            dropdown.close();
          }}
        />
      )}
    </AnchoredPopover>
  );
};
