import { insertPrSeries, listPrSeries } from '@goodboy/db';
import type { IsoDateTime, PrSeries, PrSeriesId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { requireMountContext } from '../project-mounts/requireMountContext';
import type { CreatePrSeriesInput, GetFn, SetFn } from './types';

export const createPrSeries = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    projectId,
    name,
    plannedCount,
    workItemIdentifier,
    workItemUrl,
    parentRequest,
  }: CreatePrSeriesInput): Promise<PrSeries> => {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw new Error('A series needs a name.');
    }
    requireMountContext({ get, sessionId, projectId });
    const total = plannedCount ?? null;
    if (total !== null && (!Number.isInteger(total) || total <= 0)) {
      throw new Error('A series total must be a positive whole number.');
    }
    const existing = await listPrSeries({ db: tauriDatabase, sessionId, projectId });
    if (existing.some((candidate) => candidate.name === trimmed)) {
      throw new Error(`This session already groups a series named ${trimmed} in that project.`);
    }
    const now = new Date().toISOString() as IsoDateTime;
    const series: PrSeries = {
      id: crypto.randomUUID() as PrSeriesId,
      sessionId,
      projectId,
      name: trimmed,
      workItemIdentifier: workItemIdentifier ?? null,
      workItemUrl: workItemUrl ?? null,
      plannedCount: total,
      parentRequest: parentRequest ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await insertPrSeries({ db: tauriDatabase, series });
    const views = await listPrSeries({ db: tauriDatabase, sessionId });
    set((state) => ({ prSeries: { ...state.prSeries, [sessionId]: views } }));
    return series;
  };
};
