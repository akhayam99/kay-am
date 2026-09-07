import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Collapsible, GhostActionButton, MetaRow, formatUsd } from '@goodboy/ui';
import type { ResolveAttempt } from '@goodboy/types';
import { formatAbsoluteDateTime } from '../../../../../shared/utils/relativeDate';

type Sibling = { readonly threadId: string; readonly title: string };

type Props = {
  readonly attempt: ResolveAttempt;
  readonly siblings: ReadonlyArray<Sibling>;
  readonly costUsd: number | null;
  readonly onViewWork: () => void;
  readonly onSelectSibling: (threadId: string) => void;
};

const sharedLabel = ({ count }: { readonly count: number }): string | null => {
  if (count === 0) {
    return null;
  }
  return count === 1
    ? 'shared with 1 other conversation'
    : `shared with ${count} other conversations`;
};

export const WorkSection = ({ attempt, siblings, costUsd, onViewWork, onSelectSibling }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const shared = sharedLabel({ count: siblings.length });
  return (
    <div className="flex items-start justify-between gap-3">
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="min-w-0 flex-1"
        trigger={
          <MetaRow
            items={[
              'Work',
              shared,
              attempt.provider,
              attempt.model,
              costUsd === null ? null : `${formatUsd(costUsd)} shared, counted once`,
            ]}
          />
        }
      >
        <div className="flex flex-col gap-1 pt-2 text-2xs text-muted-foreground">
          <MetaRow
            items={[
              `provider ${attempt.provider}`,
              `model ${attempt.model}`,
              attempt.effort === null ? null : `effort ${attempt.effort}`,
              `phase ${attempt.phase}`,
            ]}
          />
          <MetaRow
            items={[
              attempt.startedAt === null
                ? null
                : `started ${formatAbsoluteDateTime({ iso: new Date(attempt.startedAt).toISOString() })}`,
              attempt.endedAt === null
                ? null
                : `ended ${formatAbsoluteDateTime({ iso: new Date(attempt.endedAt).toISOString() })}`,
            ]}
          />
          {attempt.error !== null && <p className="text-warning">{attempt.error}</p>}
          {siblings.length > 0 && (
            <ul className="flex flex-col gap-0.5 pt-1">
              {siblings.map((sibling) => (
                <li key={sibling.threadId}>
                  <button
                    type="button"
                    onClick={() => onSelectSibling(sibling.threadId)}
                    className="rounded-md font-mono text-2xs underline-offset-2 motion-safe:transition-colors hover:text-foreground hover:underline"
                  >
                    {sibling.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Collapsible>
      <GhostActionButton icon={Activity} label="View work" onClick={onViewWork} />
    </div>
  );
};
