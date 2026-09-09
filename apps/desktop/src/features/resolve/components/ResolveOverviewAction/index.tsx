import { Button } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { openReview } from '../../../review/openReview';
import { RESOLVE_QUEUE_TITLE } from '../../resolveQueueCopy';

type Props = {
  readonly sessionId: SessionId;
};

export const ResolveOverviewAction = ({ sessionId }: Props) => {
  const pr = useAppStore((s) => s.sessionGithub[sessionId]?.pr ?? null);

  if (pr === null) {
    return null;
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => openReview({ sessionId, mode: 'queue' })}>
      {RESOLVE_QUEUE_TITLE}
    </Button>
  );
};
