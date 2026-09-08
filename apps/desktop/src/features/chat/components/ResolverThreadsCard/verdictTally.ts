import type { ResolverThreadVerdictKind } from './resolverThreadVerdicts';

export type VerdictTally = {
  readonly total: number;
  readonly resolved: number;
  readonly wontfix: number;
  readonly analyzed: number;
  readonly open: number;
  readonly closed: number;
  readonly settled: number;
  readonly isMixed: boolean;
};

type Countable = {
  readonly kind: ResolverThreadVerdictKind;
  readonly isClosed: boolean;
};

type Params = {
  readonly verdicts: ReadonlyArray<Countable>;
};

export const verdictTally = ({ verdicts }: Params): VerdictTally => {
  const countOf = (kind: ResolverThreadVerdictKind) =>
    verdicts.filter((verdict) => verdict.kind === kind).length;
  const resolved = countOf('resolved');
  const wontfix = countOf('wontfix');
  const analyzed = countOf('analyzed');
  const open = verdicts.filter((verdict) => verdict.kind === 'open' && !verdict.isClosed).length;
  const closed = verdicts.filter((verdict) => verdict.kind === 'open' && verdict.isClosed).length;
  const buckets = [resolved, wontfix, analyzed, open].filter((count) => count > 0).length;
  return {
    total: verdicts.length,
    resolved,
    wontfix,
    analyzed,
    open,
    closed,
    settled: resolved + wontfix + analyzed,
    isMixed: verdicts.length > 1 && buckets > 1,
  };
};
