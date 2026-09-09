import { Button } from '@goodboy/ui';
import type { ResolveQueueFilter } from '../../../../store/slices/session-view';
import { activeFilterLabel, needsReviewFilterLabel } from '../../resolveQueueCopy';

type Props = {
  readonly filter: ResolveQueueFilter;
  readonly needsReviewCount: number;
  readonly activeCount: number;
  readonly onChange: (filter: ResolveQueueFilter) => void;
};

export const QueueFilterChips = ({ filter, needsReviewCount, activeCount, onChange }: Props) => (
  <div className="flex items-center gap-4">
    <Button
      size="sm"
      variant={filter === 'for_you' ? 'secondary' : 'ghost'}
      aria-pressed={filter === 'for_you'}
      onClick={() => onChange('for_you')}
    >
      {needsReviewFilterLabel({ count: needsReviewCount })}
    </Button>
    <Button
      size="sm"
      variant={filter === 'everything' ? 'secondary' : 'ghost'}
      aria-pressed={filter === 'everything'}
      onClick={() => onChange('everything')}
    >
      {activeFilterLabel({ count: activeCount })}
    </Button>
  </div>
);
