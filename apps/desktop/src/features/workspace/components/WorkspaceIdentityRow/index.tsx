import { ChevronsUpDown, SlidersHorizontal } from 'lucide-react';
import { AnchoredPopover, StatusDot, Tooltip, useDropdown } from '@goodboy/ui';
import { useAppStore, useCurrentWorkspace, useHasUnreadElsewhere } from '../../../../store';
import { workspaceAccent } from '../../color';
import { linkedProjectsLabel } from '../../linkedProjectsLabel';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';
import { shortcutGlyphs } from '../../../../shared/keyboard/registry';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

export const WorkspaceIdentityRow = () => {
  const currentWorkspace = useCurrentWorkspace();
  const subtitle = useAppStore((state) =>
    linkedProjectsLabel({ projects: state.projects, workspaceId: currentWorkspace?.id ?? null }),
  );
  const hasUnreadElsewhere = useHasUnreadElsewhere(currentWorkspace?.id ?? null);
  const dropdown = useDropdown({
    width: 'w-[340px]',
    expectedWidth: 340,
    expectedHeight: 480,
    openEvent: 'goodboy:open-workspace-switcher',
  });

  if (!currentWorkspace) {
    return null;
  }
  const accent = workspaceAccent(currentWorkspace.id);

  return (
    <div className="flex w-full min-w-0 items-center gap-0.5">
      <AnchoredPopover
        dropdown={dropdown}
        role="dialog"
        ariaLabel="Switch or open a workspace"
        anchorClassName="min-w-0 flex-1"
        hasBackdrop
        trigger={
          <button
            type="button"
            onClick={dropdown.toggle}
            data-tauri-drag-region="false"
            aria-label={`Switch workspace: ${currentWorkspace.name}`}
            aria-expanded={dropdown.open}
            className="group flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/50"
            title={`${currentWorkspace.name}, ${subtitle} (${shortcutGlyphs('workspace.switcher')})`}
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-md text-3xs font-bold text-primary-foreground ring-1 ring-inset ring-border-soft"
              style={{ backgroundColor: accent }}
            >
              {initialOf(currentWorkspace.name)}
            </span>
            <span className="truncate text-xs font-semibold leading-tight text-foreground">
              {currentWorkspace.name}
            </span>
            {hasUnreadElsewhere ? (
              <StatusDot tone="warning" size="sm" title="Activity in another workspace" />
            ) : null}
            <ChevronsUpDown
              size={ICON_SIZE.row}
              aria-hidden
              className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
            />
          </button>
        }
      >
        <WorkspaceSwitcher onClose={dropdown.close} />
      </AnchoredPopover>
      <Tooltip content="Preferences" side="bottom">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('goodboy:open-settings', { detail: { scope: 'workspace' } }),
            )
          }
          aria-label="Preferences"
          className="flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <SlidersHorizontal size={ICON_SIZE.row} aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
};
