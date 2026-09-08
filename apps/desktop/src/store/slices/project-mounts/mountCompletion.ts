import type { PrSeriesView, SessionId } from '@goodboy/types';
import type { AppState } from '../../types';
import { mountRequestOf, type MountRequestState, type MountRequestView } from './mountRowModel';

export type MountWorkState = MountRequestState & Pick<AppState, 'sessionMounts' | 'prSeries'>;

export type MountWorkSummary = Readonly<{
  mergedRequests: number;
  openRequests: number;
  mountsWithoutRequest: number;
  incompleteSeries: number;
  remaining: number;
  reason: string | null;
}>;

type SummaryParams = {
  readonly state: MountWorkState;
  readonly sessionId: SessionId;
};

type SeriesParams = {
  readonly series: ReadonlyArray<PrSeriesView>;
};

const EMPTY_SUMMARY: MountWorkSummary = {
  mergedRequests: 0,
  openRequests: 0,
  mountsWithoutRequest: 0,
  incompleteSeries: 0,
  remaining: 0,
  reason: null,
};

const identityKey = ({ request }: { readonly request: MountRequestView }): string => {
  const identity = request.identity;
  if (identity === null) {
    return `${request.provider}|${request.url}|${request.number}`;
  }
  return `${identity.provider}|${identity.host}|${identity.repoSlug}|${identity.prNumber}`;
};

const countIncompleteSeries = ({ series }: SeriesParams): number =>
  series.filter((view) => {
    const declared = view.members.filter((member) => member.status !== 'omitted');
    const merged = declared.filter((member) => member.request?.state === 'merged').length;
    const planned = view.plannedCount;
    if (planned !== null) {
      return merged < planned;
    }
    return merged < declared.length;
  }).length;

type ReasonParams = {
  readonly openRequests: number;
  readonly mountsWithoutRequest: number;
  readonly incompleteSeries: number;
};

const summaryReason = ({
  openRequests,
  mountsWithoutRequest,
  incompleteSeries,
}: ReasonParams): string | null => {
  if (openRequests > 0) {
    return openRequests === 1
      ? '1 other request still open'
      : `${openRequests} other requests still open`;
  }
  if (mountsWithoutRequest > 0) {
    return mountsWithoutRequest === 1
      ? '1 branch mount without a request'
      : `${mountsWithoutRequest} branch mounts without a request`;
  }
  if (incompleteSeries > 0) {
    return incompleteSeries === 1
      ? 'a declared series is unfinished'
      : 'declared series unfinished';
  }
  return null;
};

export const summarizeMountWork = ({ state, sessionId }: SummaryParams): MountWorkSummary => {
  const views = state.sessionMounts?.[sessionId];
  if (views === undefined) {
    return EMPTY_SUMMARY;
  }
  const merged = new Set<string>();
  const open = new Set<string>();
  let mountsWithoutRequest = 0;
  for (const view of views) {
    if (!view.isAttached || view.worktreePath === null || view.branch === '') {
      continue;
    }
    const request = mountRequestOf({ state, mountId: view.id });
    if (request === null) {
      mountsWithoutRequest += 1;
      continue;
    }
    const key = identityKey({ request });
    if (request.state === 'merged' || request.state === 'closed') {
      merged.add(key);
      continue;
    }
    open.add(key);
  }
  const incompleteSeries = countIncompleteSeries({ series: state.prSeries?.[sessionId] ?? [] });
  const openRequests = open.size;
  return {
    mergedRequests: merged.size,
    openRequests,
    mountsWithoutRequest,
    incompleteSeries,
    remaining: openRequests + mountsWithoutRequest + incompleteSeries,
    reason: summaryReason({ openRequests, mountsWithoutRequest, incompleteSeries }),
  };
};
