import type { SessionId } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { PendingResolutionsStrip } from '../../../context/components/ContextPanel/strips/PendingResolutionsStrip';

type Props = {
  readonly sessionId: SessionId;
};

export const ResolverLaneToolbar = ({ sessionId }: Props) => {
  const hasPending = useAppStore(
    (s) => (s.sessionPendingResolutions[sessionId] ?? EMPTY_ARRAY).length > 0,
  );

  if (!hasPending) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <PendingResolutionsStrip sessionId={sessionId} />
    </div>
  );
};
