import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, Eyebrow, ScrollFade, tintClasses, type Tone } from '@goodboy/ui';
import type { Session, SessionId, SessionStage } from '@goodboy/types';
import { SESSION_STAGE_META, STAGE_TONE } from '../../../../session/session-stage';
import type { MultiSelect } from '../../../../../shared/hooks/useMultiSelect';
import { StageBoardCard } from '../StageBoardCard';
import type { BoardNavigation } from '../useBoardNavigation';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { PANE_RHYTHM } from '@goodboy/ui';

export type ColumnSpec =
  { readonly kind: 'stage'; readonly stage: SessionStage } | { readonly kind: 'archived' };

type ColumnView = {
  readonly key: SessionStage | 'archived';
  readonly label: string;
  readonly tone: Tone;
  readonly collapsible: boolean;
  readonly archived: boolean;
};

const viewFor = (spec: ColumnSpec): ColumnView => {
  if (spec.kind === 'archived') {
    return {
      key: 'archived',
      label: 'archived',
      tone: 'neutral',
      collapsible: true,
      archived: true,
    };
  }
  return {
    key: spec.stage,
    label: SESSION_STAGE_META[spec.stage].label,
    tone: STAGE_TONE[spec.stage],
    collapsible: spec.stage === 'done',
    archived: false,
  };
};

type StageColumnProps = {
  readonly spec: ColumnSpec;
  readonly sessions: ReadonlyArray<Session>;
  readonly nav: BoardNavigation;
  readonly selection: MultiSelect<SessionId>;
  readonly onArchive: (session: Session) => void;
  readonly onDelete: (session: Session) => void;
  readonly onRestore: (session: Session) => void;
};

export const StageColumn = ({
  spec,
  sessions,
  nav,
  selection,
  onArchive,
  onDelete,
  onRestore,
}: StageColumnProps) => {
  const view = viewFor(spec);
  const [collapsed, setCollapsed] = useState(view.collapsible);
  const empty = sessions.length === 0;

  const { clear: clearSelection, isSelected } = selection;
  const archivedColumn = view.archived;

  useEffect(() => {
    if (collapsed && archivedColumn) {
      clearSelection();
    }
  }, [collapsed, archivedColumn, clearSelection]);

  const header = (
    <span className="flex items-center gap-2">
      <Eyebrow
        label={view.label}
        muted={empty}
        className={cn(!empty && tintClasses(view.tone).text)}
      />
      {!empty && (
        <span className="text-2xs tabular-nums text-muted-foreground/60">{sessions.length}</span>
      )}
    </span>
  );

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        collapsed ? 'w-auto' : PANE_RHYTHM.board.colWidth,
        PANE_RHYTHM.board.colStack,
      )}
    >
      {view.collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex shrink-0 items-center gap-2 text-left"
        >
          <ChevronDown
            size={ICON_SIZE.row}
            aria-hidden
            className={cn(
              'shrink-0 text-muted-foreground/50 transition-transform',
              collapsed && '-rotate-90',
            )}
          />
          {header}
        </button>
      ) : (
        <div className="shrink-0">{header}</div>
      )}

      {!collapsed && !empty && (
        <ScrollFade orientation="vertical" className="flex-1">
          <div className={cn('flex flex-col', PANE_RHYTHM.board.cardGap)}>
            {sessions.map((session) => (
              <StageBoardCard
                key={session.id}
                session={session}
                nav={nav}
                archived={view.archived}
                selected={isSelected(session.id as SessionId)}
                onModifierClick={selection.handleItemClick}
                onArchive={onArchive}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            ))}
          </div>
        </ScrollFade>
      )}
    </div>
  );
};
