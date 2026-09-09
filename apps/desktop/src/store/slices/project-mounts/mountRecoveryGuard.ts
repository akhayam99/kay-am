import type { SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';

type Params = {
  readonly sessionId: SessionId;
  readonly run: () => Promise<unknown>;
};

const running = new Set<SessionId>();
const settled = new Set<SessionId>();

export const runMountRecoveryOnce = ({ sessionId, run }: Params): void => {
  if (running.has(sessionId) || settled.has(sessionId)) {
    return;
  }
  running.add(sessionId);
  void run().then(
    () => {
      settled.add(sessionId);
      running.delete(sessionId);
    },
    (error: unknown) => {
      running.delete(sessionId);
      console.error(
        `[mounts] operation recovery failed for session ${sessionId}`,
        formatError(error),
      );
    },
  );
};

export const resetMountRecoveryGuard = (): void => {
  running.clear();
  settled.clear();
};
