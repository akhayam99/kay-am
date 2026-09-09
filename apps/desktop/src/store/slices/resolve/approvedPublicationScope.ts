import {
  listResolveCandidateItems,
  listResolveCandidates,
  listResolveQueueItems,
} from '@goodboy/db';
import type { ResolveQueueItemWithThread, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';

export type ApprovedRange = Readonly<{
  candidateId: string;
  baseSha: string;
  integratedSha: string;
}>;

export type ApprovedPublicationScope = Readonly<{
  threadIds: ReadonlySet<string>;
  refusedThreadIds: ReadonlySet<string>;
  itemIds: ReadonlyArray<string>;
  candidateIds: ReadonlyArray<string>;
  shas: ReadonlySet<string>;
  ranges: ReadonlyArray<ApprovedRange>;
}>;

type Params = { readonly sessionId: SessionId };

export const approvedPublicationScope = async ({
  sessionId,
}: Params): Promise<ApprovedPublicationScope> => {
  const db = tauriDatabase;
  const entries = await listResolveQueueItems({ db, sessionId });
  const isCurrent = ({ item, thread }: ResolveQueueItemWithThread): boolean =>
    item.approvedRevision === thread.revision &&
    item.candidateRevision === item.approvedRevision &&
    item.deliveredAt === null;
  const approved = entries.filter(
    (entry) => entry.item.approvalState === 'accepted' && isCurrent(entry),
  );
  const refused = entries.filter(
    (entry) => entry.item.approvalState === 'wont_fix' && isCurrent(entry),
  );
  const decided = [...approved, ...refused];
  const acceptedItemIds = approved.map(({ item }) => item.id);
  const itemIds = [...acceptedItemIds, ...refused.map(({ item }) => item.id)];
  const shas = new Set(
    approved.flatMap(({ item, thread }) => [
      ...(thread.disposition === 'fix' ? (thread.commitShas ?? []) : []),
      ...(item.integratedSha === null ? [] : [item.integratedSha]),
    ]),
  );
  const candidates = await listResolveCandidates({ db, sessionId }).catch(() => []);
  const approvedItemIds = new Set(acceptedItemIds);
  const covering = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.integratedSha === null) {
        return null;
      }
      const members = await listResolveCandidateItems({ db, candidateId: candidate.id }).catch(
        () => [],
      );
      const isCovering = members.some((member) => approvedItemIds.has(member.queueItemId));
      return isCovering
        ? {
            candidateId: candidate.id,
            baseSha: candidate.baseSha,
            integratedSha: candidate.integratedSha,
          }
        : null;
    }),
  );
  const ranges = covering.flatMap((range) => (range === null ? [] : [range]));
  return {
    threadIds: new Set(decided.map(({ thread }) => thread.threadId)),
    refusedThreadIds: new Set(refused.map(({ thread }) => thread.threadId)),
    itemIds,
    candidateIds: ranges.map((range) => range.candidateId),
    shas,
    ranges,
  };
};
