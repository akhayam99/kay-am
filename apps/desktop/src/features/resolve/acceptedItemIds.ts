import type { ResolveQueueItemWithThread } from '@goodboy/types';

type Params = { readonly entries: ReadonlyArray<ResolveQueueItemWithThread> };

export const acceptedItemIds = ({ entries }: Params): ReadonlyArray<string> =>
  entries
    .filter(({ item }) => item.approvalState === 'accepted' && item.integratedSha !== null)
    .map(({ item }) => item.id)
    .sort((left, right) => left.localeCompare(right));
