import type { SessionId } from '@goodboy/types';

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
    () => {
      running.delete(sessionId);
    },
  );
};

export const resetMountRecoveryGuard = (): void => {
  running.clear();
  settled.clear();
};
