import { listResolveThreads } from '@goodboy/db';
import type { ResolveThread, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly threadId: string;
  readonly previous: ResolveThread | undefined;
  readonly hasCommit: boolean;
  readonly error: string;
};

export const restoreResolvePublication = async ({
  get,
  sessionId,
  threadId,
  previous,
  hasCommit,
  error,
}: Params): Promise<void> => {
  const current = (await listResolveThreads({ db: tauriDatabase, sessionId })).find(
    (row) => row.threadId === threadId,
  );
  if (current?.state !== 'publishing') {
    return;
  }
  await get().updateResolveThread({
    sessionId,
    threadId,
    revision: current.revision,
    patch: {
      state:
        previous?.state === 'fixed' || previous?.state === 'answered'
          ? previous.state
          : hasCommit
            ? 'fixed'
            : 'answered',
      stateReason: `publication_failed:${JSON.stringify({ error, reason: current.stateReason ?? previous?.stateReason ?? null })}`,
    },
  });
};
