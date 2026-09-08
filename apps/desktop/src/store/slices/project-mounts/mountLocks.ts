type LockParams<T> = {
  readonly key: string;
  readonly run: () => Promise<T>;
};

const chains = new Map<string, Promise<void>>();

export const withMountLock = async <T>({ key, run }: LockParams<T>): Promise<T> => {
  const previous = chains.get(key) ?? Promise.resolve();
  const result = previous.then(run, run);
  const guard = result.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, guard);
  void guard.then(() => {
    if (chains.get(key) === guard) {
      chains.delete(key);
    }
  });
  return result;
};

type RepoLockParams<T> = {
  readonly repoRoot: string;
  readonly mountKey: string;
  readonly run: () => Promise<T>;
};

export const withRepositoryAndMountLock = async <T>({
  repoRoot,
  mountKey,
  run,
}: RepoLockParams<T>): Promise<T> =>
  withMountLock({
    key: `repo:${repoRoot}`,
    run: () => withMountLock({ key: `mount:${mountKey}`, run }),
  });
