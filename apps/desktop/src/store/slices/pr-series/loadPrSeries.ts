import { listPrSeries } from '@goodboy/db';
import type { PrSeriesView } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import type { GetFn, LoadPrSeriesInput, SetFn } from './types';

export const loadPrSeries = (set: SetFn, _get: GetFn) => {
  return async ({
    sessionId,
    projectId,
  }: LoadPrSeriesInput): Promise<ReadonlyArray<PrSeriesView>> => {
    const views = await listPrSeries({ db: tauriDatabase, sessionId });
    set((state) => ({ prSeries: { ...state.prSeries, [sessionId]: views } }));
    if (projectId === undefined) {
      return views;
    }
    return views.filter((view) => view.projectId === projectId);
  };
};
