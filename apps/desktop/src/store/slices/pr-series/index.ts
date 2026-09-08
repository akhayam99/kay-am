import { createPrSeries } from './createPrSeries';
import { loadPrSeries } from './loadPrSeries';
import { setPrSeriesMember } from './setPrSeriesMember';
import type { GetFn, SetFn } from './types';

export type { CreatePrSeriesInput, LoadPrSeriesInput, SetPrSeriesMemberInput } from './types';
export { prSeriesInitialState } from './state';

export const createPrSeriesSlice = (set: SetFn, get: GetFn) => {
  return {
    createPrSeries: createPrSeries(set, get),
    setPrSeriesMember: setPrSeriesMember(set, get),
    loadPrSeries: loadPrSeries(set, get),
  };
};
