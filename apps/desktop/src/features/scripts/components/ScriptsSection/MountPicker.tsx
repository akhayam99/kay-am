import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Popover } from '@goodboy/ui';
import type { MountId, SessionProjectMount } from '@goodboy/types';

type MountPickerProps = {
  readonly scriptName: string;
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly anchor: DOMRect;
  readonly onPick: (mountId: MountId) => void;
  readonly onClose: () => void;
};

export const MountPicker = ({ scriptName, mounts, anchor, onPick, onClose }: MountPickerProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const onDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const width = 280;
  const left = Math.max(16, Math.min(anchor.left - width, window.innerWidth - width - 16));
  const top = Math.max(16, Math.min(anchor.bottom + 6, window.innerHeight - 240));

  return createPortal(
    <Popover
      innerRef={panelRef}
      role="dialog"
      ariaLabel={`Pick a mount for ${scriptName}`}
      style={{ position: 'fixed', left, top, width }}
      className="z-popover flex flex-col gap-1 p-2"
    >
      <span className="px-1 text-2xs text-muted-foreground">Run in which mount?</span>
      {mounts.map((mount) => (
        <button
          key={mount.mountId ?? mount.worktreePath}
          type="button"
          onClick={() => {
            const mountId = mount.mountId;
            if (mountId !== undefined) {
              onPick(mountId);
            }
          }}
          className="flex min-w-0 flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        >
          <span className="min-w-0 truncate text-xs text-foreground">{mount.mountName}</span>
          <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
            {mount.branch === '' ? mount.worktreePath : mount.branch}
          </span>
        </button>
      ))}
    </Popover>,
    document.body,
  );
};
