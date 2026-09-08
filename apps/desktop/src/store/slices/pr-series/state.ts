import type { PrSeriesView } from '@goodboy/types';

export type PrSeriesState = {
  readonly prSeries: Readonly<Record<string, ReadonlyArray<PrSeriesView>>>;
};

export const prSeriesInitialState: PrSeriesState = {
  prSeries: {},
};
