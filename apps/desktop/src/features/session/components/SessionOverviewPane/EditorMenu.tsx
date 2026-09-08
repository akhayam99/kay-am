import { useEffect, useMemo } from 'react';
import {
  AnchoredPopover,
  Button,
  IconButton,
  Tooltip,
  cn,
  formatError,
  useDropdown,
  type OverflowMenuItem,
} from '@goodboy/ui';
import { Copy } from 'lucide-react';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { openInEditor } from '../../../../shared/lib/editor';
import { useToast } from '../../../../app/components/Toast';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import type { Density } from '../../density';
import { EditorMenuContent } from './EditorMenuContent';

const REFERENCE_EDITORS = new Set(['code', 'cursor']);

type FolderTarget = {
  readonly name: string;
  readonly worktreePath: string;
};

type Props = {
  readonly sessionId: SessionId;
  readonly density?: Density;
  readonly target?: FolderTarget | null;
  readonly triggerClassName?: string;
};

type LaunchEditorParams = {
  readonly binary: string;
};

export const EditorMenu = ({
  sessionId,
  density = 'full',
  target = null,
  triggerClassName,
}: Props) => {
  const sessionWorktreePath = useAppStore(
    (state) => state.sessionWorktrees[sessionId]?.[0] ?? null,
  );
  const worktreePath = target === null ? sessionWorktreePath : target.worktreePath;
  const detectedEditors = useAppStore((state) => state.detectedEditors);
  const loadDetectedEditors = useAppStore((state) => state.loadDetectedEditors);
  const { showToast } = useToast();
  const dropdown = useDropdown({
    align: 'start',
    width: 'min-w-[180px]',
    expectedHeight: 220,
  });

  useEffect(() => {
    if (detectedEditors.length > 0) {
      return;
    }
    void loadDetectedEditors();
  }, []);

  const launchEditor = async ({ binary }: LaunchEditorParams) => {
    if (worktreePath == null) {
      return;
    }
    try {
      await openInEditor(worktreePath, binary);
    } catch (error) {
      showToast('error', `couldn't open editor: ${formatError(error)}`);
    }
  };

  const copyPath = async () => {
    if (worktreePath == null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(worktreePath);
      showToast('success', 'worktree path copied');
    } catch (error) {
      showToast('error', `couldn't copy path: ${formatError(error)}`);
    }
  };

  const items = useMemo<ReadonlyArray<OverflowMenuItem>>(() => {
    const referenceEditors = detectedEditors.filter((editor) =>
      REFERENCE_EDITORS.has(editor.binary),
    );
    const editorItems: ReadonlyArray<OverflowMenuItem> =
      referenceEditors.length === 0
        ? [
            {
              kind: 'item',
              key: 'no-editor',
              label: 'No editor detected',
              icon: CONCEPT_ICONS.folderOpen,
              onClick: () => undefined,
              disabled: true,
            },
          ]
        : [
            { kind: 'header', key: 'editor-header', label: 'Open in editor' },
            ...referenceEditors.map((editor): OverflowMenuItem => ({
              kind: 'item',
              key: `editor-${editor.binary}`,
              label: editor.label,
              icon: CONCEPT_ICONS.folderOpen,
              onClick: () => void launchEditor({ binary: editor.binary }),
              disabled: worktreePath == null,
            })),
          ];
    return [
      ...editorItems,
      { kind: 'separator', key: 'path-sep' },
      {
        kind: 'item',
        key: 'copy-path',
        label: 'Copy path',
        icon: Copy,
        onClick: () => void copyPath(),
        disabled: worktreePath == null,
      },
    ];
  }, [detectedEditors, worktreePath]);

  const label = target === null ? 'Open worktree' : `Open the folder of ${target.name}`;
  const tooltip =
    target === null
      ? 'Open the worktree in an editor, or copy its path'
      : `Open ${target.name} in an editor, or copy its path`;

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="menu"
      ariaLabel={label}
      className="py-1"
      anchorClassName="shrink-0"
      trigger={
        density === 'compact' ? (
          <IconButton
            variant="ghost"
            icon={CONCEPT_ICONS.folderOpen}
            iconSize={ICON_SIZE.row}
            label={label}
            tooltip={tooltip}
            aria-haspopup="menu"
            aria-expanded={dropdown.open}
            onClick={dropdown.toggle}
            className={cn('size-7', triggerClassName, dropdown.open && 'opacity-100 bg-muted/60')}
          />
        ) : (
          <Tooltip content={tooltip}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={dropdown.open}
              onClick={dropdown.toggle}
              className={cn(triggerClassName, dropdown.open && 'bg-muted')}
            >
              <CONCEPT_ICONS.folderOpen size={ICON_SIZE.row} aria-hidden />
              Open
            </Button>
          </Tooltip>
        )
      }
    >
      <EditorMenuContent items={items} onClose={dropdown.close} />
    </AnchoredPopover>
  );
};
