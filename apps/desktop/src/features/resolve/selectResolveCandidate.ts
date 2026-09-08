import type { ResolveCandidate } from '@goodboy/types';
import type { ResolveCandidateWithItems } from '../../store/slices/resolve/state';

type Params = {
  readonly candidates: ReadonlyArray<ResolveCandidateWithItems>;
  readonly itemId: string;
};

const LIVE: ReadonlySet<ResolveCandidate['state']> = new Set(['ready', 'integrated']);

export const selectResolveCandidate = ({ candidates, itemId }: Params): ResolveCandidate | null =>
  candidates
    .filter(
      ({ candidate, items }) =>
        LIVE.has(candidate.state) && items.some((item) => item.queueItemId === itemId),
    )
    .map(({ candidate }) => candidate)
    .reduce<ResolveCandidate | null>(
      (latest, candidate) =>
        latest === null || candidate.createdAt >= latest.createdAt ? candidate : latest,
      null,
    );

export const candidateHeadSha = ({
  candidate,
}: {
  readonly candidate: ResolveCandidate;
}): string =>
  candidate.state === 'integrated' && candidate.integratedSha !== null
    ? candidate.integratedSha
    : candidate.candidateSha;
