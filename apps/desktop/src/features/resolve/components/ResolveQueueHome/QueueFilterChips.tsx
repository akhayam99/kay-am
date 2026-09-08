import { Button } from '@goodboy/ui';
import type { ResolveQueueFilter } from '../../../../store/slices/session-view';

type Props = {
  readonly filter: ResolveQueueFilter;
  readonly forYouCount: number;
  readonly everythingCount: number;
  readonly onChange: (filter: ResolveQueueFilter) => void;
};

export const QueueFilterChips = ({ filter, forYouCount, everythingCount, onChange }: Props) => (
  <div className="flex items-center gap-1.5">
    <Button
      size="sm"
      variant={filter === 'for_you' ? 'secondary' : 'ghost'}
      onClick={() => onChange('for_you')}
    >
      {`For you (${forYouCount})`}
    </Button>
    <Button
      size="sm"
      variant={filter === 'everything' ? 'secondary' : 'ghost'}
      onClick={() => onChange('everything')}
    >
      {`Everything (${everythingCount})`}
    </Button>
  </div>
);
