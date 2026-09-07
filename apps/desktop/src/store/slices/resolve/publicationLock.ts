import { listActiveResolvePublications } from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';

type Held = { readonly promise: Promise<unknown>; readonly scopeId: string | null };

const inFlight = new Map<string, Held>();

type TargetParams = {
  readonly repo: string;
  readonly prNumber: number;
  readonly scopeId?: string;
};

const publicationLockKey = ({ repo, prNumber }: TargetParams): string => `${repo}#${prNumber}`;

const isHeldByOthers = ({ repo, prNumber, scopeId }: TargetParams): boolean => {
  const held = inFlight.get(publicationLockKey({ repo, prNumber }));
  if (held === undefined) {
    return false;
  }
  return scopeId === undefined || held.scopeId !== scopeId;
};

export const isPublicationTargetBusy = async ({
  repo,
  prNumber,
  scopeId,
  exceptPublicationId,
}: TargetParams & { readonly exceptPublicationId?: string }): Promise<boolean> => {
  if (isHeldByOthers({ repo, prNumber, scopeId })) {
    return true;
  }
  const active = await listActiveResolvePublications({ db: tauriDatabase, repo, prNumber });
  return active.some((publication) => publication.id !== exceptPublicationId);
};

type RunParams<T> = TargetParams & {
  readonly onBusy: () => T;
  readonly exceptPublicationId?: string;
  readonly run: () => Promise<T>;
};

export const withPublicationLock = async <T>({
  repo,
  prNumber,
  scopeId,
  onBusy,
  exceptPublicationId,
  run,
}: RunParams<T>): Promise<T> => {
  const key = publicationLockKey({ repo, prNumber });
  const held = inFlight.get(key);
  if (held !== undefined) {
    if (scopeId !== undefined && held.scopeId === scopeId) {
      return run();
    }
    return onBusy();
  }
  let open = (): void => undefined;
  const reservation = new Promise<void>((resolve) => {
    open = resolve;
  });
  inFlight.set(key, { promise: reservation, scopeId: scopeId ?? null });
  try {
    const active = await listActiveResolvePublications({ db: tauriDatabase, repo, prNumber });
    if (active.some((publication) => publication.id !== exceptPublicationId)) {
      return onBusy();
    }
    return await run();
  } finally {
    inFlight.delete(key);
    open();
  }
};
