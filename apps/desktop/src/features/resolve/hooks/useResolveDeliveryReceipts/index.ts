import { useEffect, useState } from 'react';
import { listResolvePublicationThreads } from '@goodboy/db';
import type { ResolvePublication, ResolvePublicationThread } from '@goodboy/types';
import { tauriDatabase } from '../../../../shared/lib/db';

const EMPTY_RECEIPTS: ReadonlyArray<ResolvePublicationThread> = [];

type Params = {
  readonly publications: ReadonlyArray<ResolvePublication>;
};

export const useResolveDeliveryReceipts = ({
  publications,
}: Params): ReadonlyArray<ResolvePublicationThread> => {
  const [receipts, setReceipts] = useState<ReadonlyArray<ResolvePublicationThread>>(EMPTY_RECEIPTS);
  const publicationIds = publications.map((publication) => publication.id).join(',');

  useEffect(() => {
    if (publicationIds === '') {
      setReceipts(EMPTY_RECEIPTS);
      return;
    }
    let cancelled = false;
    Promise.all(
      publicationIds
        .split(',')
        .map((publicationId) =>
          listResolvePublicationThreads({ db: tauriDatabase, publicationId }).catch(() => []),
        ),
    )
      .then((groups) => {
        if (!cancelled) {
          setReceipts(groups.flat());
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [publicationIds]);

  return receipts;
};
