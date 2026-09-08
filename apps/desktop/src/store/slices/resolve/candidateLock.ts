import { acquireWorktreeWriter, releaseWorktreeWriter } from '../../../features/worktree/worktree';

type RunParams<T> = {
  readonly worktreePath: string;
  readonly holder: string;
  readonly run: () => Promise<T>;
};

const inFlight = new Map<string, Promise<void>>();

export const CANDIDATE_WRITER_BUSY = 'Another writer holds this worktree';

const runExclusively = async <T>({ worktreePath, holder, run }: RunParams<T>): Promise<T> => {
  const lease = await acquireWorktreeWriter({ path: worktreePath, holder });
  if (!lease.isGranted) {
    throw new Error(CANDIDATE_WRITER_BUSY);
  }
  try {
    return await run();
  } finally {
    await releaseWorktreeWriter({ path: worktreePath, holder }).catch(() => undefined);
  }
};

export const withCandidateLock = async <T>({
  worktreePath,
  holder,
  run,
}: RunParams<T>): Promise<T> => {
  const previous = inFlight.get(worktreePath) ?? Promise.resolve();
  const exclusive = () => runExclusively({ worktreePath, holder, run });
  const started = previous.then(exclusive, exclusive);
  const settled = started.then(
    () => undefined,
    () => undefined,
  );
  inFlight.set(worktreePath, settled);
  try {
    return await started;
  } finally {
    if (inFlight.get(worktreePath) === settled) {
      inFlight.delete(worktreePath);
    }
  }
};
