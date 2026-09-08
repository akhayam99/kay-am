import { useMemo } from 'react';
import { EmptyState, Eyebrow, ScrollFade } from '@goodboy/ui';
import type { PrReviewDraft } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../../shared/components/conceptIcons';
import { DraftCard } from './DraftCard';

type Props = {
  readonly drafts: ReadonlyArray<PrReviewDraft>;
  readonly onEdit: (id: string, body: string) => void;
  readonly onDiscard: (id: string) => void;
};

export const DraftsPanel = ({ drafts, onEdit, onDiscard }: Props) => {
  const groups = useMemo(() => {
    const byPath = new Map<string, PrReviewDraft[]>();
    for (const draft of drafts) {
      const list = byPath.get(draft.path);
      if (list != null) {
        list.push(draft);
        continue;
      }
      byPath.set(draft.path, [draft]);
    }
    return [...byPath.entries()].map(([path, items]) => ({
      path,
      items: [...items].sort((a, b) => a.line - b.line),
    }));
  }, [drafts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-3">
        <Eyebrow label="Draft comments" />
        <span className="text-2xs tabular-nums text-muted-foreground/50">{drafts.length}</span>
      </div>
      {drafts.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3">
          <EmptyState
            icon={CONCEPT_ICONS.review}
            tone={CONCEPT_TONE.review}
            title="No draft comments yet"
            description="Ask the agent to draft comments, or click a diff line."
            size="inline"
          />
        </div>
      ) : (
        <ScrollFade className="min-h-0 flex-1" fadeSize={24}>
          <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
            {groups.map((group) => (
              <div key={group.path} className="flex flex-col gap-1.5">
                <span className="truncate px-0.5 font-mono text-3xs text-muted-foreground/70">
                  {group.path}
                </span>
                {group.items.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onEdit={(body) => onEdit(draft.id, body)}
                    onDiscard={() => onDiscard(draft.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        </ScrollFade>
      )}
    </div>
  );
};
