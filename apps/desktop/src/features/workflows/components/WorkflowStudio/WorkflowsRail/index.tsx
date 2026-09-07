import type { ReactNode } from 'react';
import { Divider, EmptyState, ScrollFade, SectionHeader, Tooltip, cn } from '@goodboy/ui';
import { Check, Plus, RotateCcw, X } from 'lucide-react';
import type { Workflow, WorkflowId } from '@goodboy/types';
import {
  CONCEPT_ICONS,
  CONCEPT_TONE,
  ICON_SIZE,
} from '../../../../../shared/components/conceptIcons';
import { PresetCard } from '../../PresetCard';

type Props = {
  readonly presets: ReadonlyArray<Workflow>;
  readonly activeId: WorkflowId | null;
  readonly resetting: boolean;
  readonly confirmReset: boolean;
  readonly setConfirmReset: (value: boolean) => void;
  readonly onSelect: (t: Workflow) => void;
  readonly onNew: () => void;
  readonly onReset: () => void;
  readonly importSection: ReactNode;
};

export const WorkflowsRail = ({
  presets,
  activeId,
  resetting,
  confirmReset,
  setConfirmReset,
  onSelect,
  onNew,
  onReset,
  importSection,
}: Props) => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pb-2 pt-3">
        <SectionHeader
          label={`Presets (${presets.length})`}
          action={
            <button
              type="button"
              onClick={onNew}
              aria-label="New workflow"
              className="inline-flex items-center gap-1 rounded-md border border-border-soft px-2 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
            >
              <Plus size={11} aria-hidden /> New
            </button>
          }
        />
      </div>

      <ScrollFade className="min-h-0 flex-1" viewportClassName="px-3 pb-3" fadeSize={24}>
        {presets.length === 0 ? (
          <EmptyState
            icon={CONCEPT_ICONS.workflows}
            tone={CONCEPT_TONE.workflows}
            title="No presets yet"
            description="Create one to chain several agents in a single session."
            size="inline"
            bordered
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {presets.map((t) => (
              <PresetCard
                key={t.id}
                template={t}
                active={t.id === activeId}
                onSelect={() => onSelect(t)}
              />
            ))}
          </ul>
        )}
      </ScrollFade>

      <Divider />
      <div className="shrink-0 px-3 py-3">{importSection}</div>
      <Divider />

      <div className="shrink-0 px-3 pb-3 pt-1">
        {confirmReset ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-warning/5 px-2.5 py-2">
            <span className="flex-1 text-2xs leading-tight text-muted-foreground">
              Restore the built-in presets? Your edits to them are overwritten. Custom presets you
              made are kept.
            </span>
            <Tooltip content="confirm restore">
              <button
                type="button"
                onClick={onReset}
                disabled={resetting}
                aria-label="Confirm restore defaults"
                className="rounded-md p-0.5 text-warning transition-colors hover:bg-warning/10 disabled:opacity-50"
              >
                <Check size={ICON_SIZE.row} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip content="cancel">
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                disabled={resetting}
                aria-label="Cancel restore defaults"
                className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                <X size={ICON_SIZE.row} aria-hidden />
              </button>
            </Tooltip>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className={cn(
              'inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5',
              'text-2xs font-medium text-muted-foreground/70 transition-colors',
              'hover:bg-muted/40 hover:text-foreground',
            )}
          >
            <RotateCcw size={11} aria-hidden /> Restore defaults
          </button>
        )}
      </div>
    </div>
  );
};
