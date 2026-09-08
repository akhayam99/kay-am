import { getPrSeries, listPrSeries, listPrSeriesMembers, upsertPrSeriesMember } from '@goodboy/db';
import type {
  IsoDateTime,
  MountId,
  PrSeries,
  PrSeriesMember,
  PrSeriesMemberId,
  PrSeriesMemberStatus,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { GetFn, SetFn, SetPrSeriesMemberInput } from './types';

type BranchParams = {
  readonly get: GetFn;
  readonly sessionId: SetPrSeriesMemberInput['sessionId'];
  readonly mountId: MountId;
};

const mountBranch = ({ get, sessionId, mountId }: BranchParams): string => {
  const mount = (get().sessionMounts[sessionId] ?? []).find(
    (candidate) => candidate.id === mountId,
  );
  if (mount === undefined) {
    throw new Error(`No mount of this session has the id ${mountId}.`);
  }
  if (mount.branch === '') {
    throw new Error('That mount has no branch yet, so it cannot hold a series position.');
  }
  return mount.branch;
};

type LabelParams = {
  readonly series: PrSeries;
  readonly position: number;
  readonly supplied: string;
  readonly existing: PrSeriesMember | undefined;
};

const memberLabel = ({ series, position, supplied, existing }: LabelParams): string => {
  if (supplied !== '') {
    return supplied;
  }
  if (existing !== undefined) {
    return existing.label;
  }
  return series.plannedCount === null ? String(position) : `${position}/${series.plannedCount}`;
};

type StatusParams = {
  readonly isOmitted: boolean;
  readonly mountId: MountId | null;
};

const memberStatus = ({ isOmitted, mountId }: StatusParams): PrSeriesMemberStatus => {
  if (isOmitted) {
    return 'omitted';
  }
  return mountId === null ? 'planned' : 'active';
};

export const setPrSeriesMember = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    seriesId,
    position,
    mountId,
    label,
    isOmitted,
  }: SetPrSeriesMemberInput): Promise<PrSeriesMember> => {
    if (!Number.isInteger(position) || position <= 0) {
      throw new Error('A series position must be a positive whole number.');
    }
    const series = await getPrSeries({ db: tauriDatabase, sessionId, seriesId });
    if (series === null) {
      throw new Error(`No series of this session has the id ${seriesId}.`);
    }
    if (series.plannedCount !== null && position > series.plannedCount) {
      throw new Error(
        `This series plans ${series.plannedCount} positions, so ${position} is outside it.`,
      );
    }
    const members = await listPrSeriesMembers({ db: tauriDatabase, seriesId });
    const existing = members.find((candidate) => candidate.ordinal === position);
    const target = mountId ?? null;
    const branch = target === null ? null : mountBranch({ get, sessionId, mountId: target });
    const isTaken =
      existing !== undefined &&
      existing.mountId !== null &&
      (existing.mountId !== target || existing.branch !== branch);
    if (isTaken && target !== null) {
      throw new Error(
        `Position ${position} already names mount ${existing?.mountId} on ${existing?.branch}. Free it before reassigning it.`,
      );
    }
    if (isTaken && target === null && isOmitted !== true) {
      throw new Error(
        `Position ${position} already names mount ${existing?.mountId}, so it cannot fall back to a planned position.`,
      );
    }
    const duplicate =
      target === null
        ? undefined
        : members.find(
            (candidate) =>
              candidate.ordinal !== position &&
              candidate.mountId === target &&
              candidate.branch === branch,
          );
    if (duplicate !== undefined) {
      throw new Error(
        `That mount already holds position ${duplicate.ordinal} of this series on ${branch}.`,
      );
    }
    const keptMountId = target ?? existing?.mountId ?? null;
    const keptBranch = branch ?? existing?.branch ?? null;
    const status = memberStatus({ isOmitted: isOmitted === true, mountId: keptMountId });
    const now = new Date().toISOString() as IsoDateTime;
    const member: PrSeriesMember = {
      id: existing?.id ?? (crypto.randomUUID() as PrSeriesMemberId),
      seriesId,
      mountId: keptMountId,
      branch: keptBranch,
      ordinal: position,
      label: memberLabel({ series, position, supplied: (label ?? '').trim(), existing }),
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await upsertPrSeriesMember({ db: tauriDatabase, member });
    const views = await listPrSeries({ db: tauriDatabase, sessionId });
    set((state) => ({ prSeries: { ...state.prSeries, [sessionId]: views } }));
    return member;
  };
};
