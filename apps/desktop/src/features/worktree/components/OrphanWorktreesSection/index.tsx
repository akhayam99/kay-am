import { useState } from 'react';
import { FolderX, Trash2 } from 'lucide-react';
import { Button, Divider, formatError, InlineConfirm, SectionHeader } from '@goodboy/ui';
import type { WorkspaceId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { formatDiskSize } from '../../utils/formatDiskSize';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

const EMPTY: ReadonlyArray<never> = [];

type Props = {
  readonly workspaceId: WorkspaceId;
};

export const OrphanWorktreesSection = ({ workspaceId }: Props) => {
  const orphans = useAppStore((s) => s.orphanWorktrees[workspaceId] ?? EMPTY);
  const removeOrphanWorktrees = useAppStore((s) => s.removeOrphanWorktrees);
  const { showToast } = useToast();
  const [isArmed, setIsArmed] = useState(false);

  if (orphans.length === 0) {
    return null;
  }

  const totalBytes = orphans.reduce((sum, orphan) => sum + orphan.sizeBytes, 0);
  const folderLabel = `${orphans.length} ${orphans.length === 1 ? 'folder' : 'folders'}`;

  const onConfirm = async () => {
    try {
      await removeOrphanWorktrees({ workspaceId, paths: orphans.map((o) => o.path) });
      showToast('success', `removed ${folderLabel}`);
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsArmed(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Divider />
      <section className="flex flex-col gap-4">
        <SectionHeader
          label="Session folders left on disk"
          hint="No session and no retained record claims these. Deleting them frees the space. Branches are never touched."
        />
        <div className="flex flex-col gap-1.5">
          {orphans.map((orphan) => (
            <div
              key={orphan.path}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-xs text-foreground">{orphan.name}</span>
                <span className="truncate text-2xs text-muted-foreground">
                  {orphan.isRegistered ? `${orphan.path} (still registered with git)` : orphan.path}
                </span>
              </div>
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {formatDiskSize({ bytes: orphan.sizeBytes })}
              </span>
            </div>
          ))}
        </div>
        {isArmed ? (
          <InlineConfirm
            role="danger"
            icon={<FolderX size={ICON_SIZE.row} aria-hidden />}
            title={`Delete ${folderLabel}`}
            description={`${formatDiskSize({ bytes: totalBytes })} will be removed from disk. This cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={onConfirm}
            onCancel={() => setIsArmed(false)}
          />
        ) : (
          <div className="flex justify-start">
            <Button variant="danger" size="sm" onClick={() => setIsArmed(true)}>
              <Trash2 size={ICON_SIZE.row} aria-hidden />
              Delete {folderLabel} ({formatDiskSize({ bytes: totalBytes })})
            </Button>
          </div>
        )}
      </section>
    </div>
  );
};
