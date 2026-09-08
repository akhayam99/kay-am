import type { PrSeries, PrSeriesMember } from '@goodboy/types';

type Params = {
  readonly series: PrSeries;
  readonly member: PrSeriesMember;
  readonly body: string;
};

export const seriesReferenceLines = ({ series, member, body }: Params): ReadonlyArray<string> => {
  const lines: Array<string> = [];
  const identifier = series.workItemIdentifier ?? '';
  if (identifier !== '' && !body.includes(identifier)) {
    lines.push(`Part of ${identifier}`);
  }
  const position =
    series.plannedCount === null
      ? String(member.ordinal)
      : `${member.ordinal}/${series.plannedCount}`;
  const positionLine = `${series.name} ${position}`;
  if (!body.includes(positionLine)) {
    lines.push(positionLine);
  }
  return lines;
};
