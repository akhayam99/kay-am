import type { VerdictTally } from './verdictTally';

type Params = {
  readonly tally: VerdictTally;
};

export const tallySentence = ({ tally }: Params): string | null => {
  if (tally.total < 2) {
    return null;
  }
  const parts = [
    tally.resolved > 0 ? `${tally.resolved} fixed` : null,
    tally.wontfix > 0 ? `${tally.wontfix} no change` : null,
    tally.analyzed > 0 ? `${tally.analyzed} explained` : null,
    tally.closed > 0 ? `${tally.closed} closed` : null,
    tally.open > 0 ? `${tally.open} needs you` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' · ');
};
