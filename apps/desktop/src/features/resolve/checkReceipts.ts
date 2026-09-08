import type { ResolveCandidate, ResolveCheckRun } from '@goodboy/types';

export type ResolveCheckReceipt = {
  readonly run: ResolveCheckRun;
  readonly tree: 'base' | 'candidate';
  readonly isStale: boolean;
};

export type ResolveChecksVerdict =
  | { readonly kind: 'nothing_ran' }
  | { readonly kind: 'all_stale' }
  | { readonly kind: 'proves_the_fix'; readonly testIdentity: string | null }
  | { readonly kind: 'passes_without_base_run'; readonly testIdentity: string | null }
  | { readonly kind: 'passes_on_both'; readonly testIdentity: string | null }
  | { readonly kind: 'fails_on_the_proposal' }
  | { readonly kind: 'base_only' };

export type ResolveChecksSummary = {
  readonly receipts: ReadonlyArray<ResolveCheckReceipt>;
  readonly verdict: ResolveChecksVerdict;
  readonly isScoped: boolean;
};

type Params = {
  readonly runs: ReadonlyArray<ResolveCheckRun>;
  readonly candidate: ResolveCandidate | null;
  readonly acceptedSet: ReadonlyArray<string>;
};

const sameSet = ({
  left,
  right,
}: {
  readonly left: ReadonlyArray<string>;
  readonly right: ReadonlyArray<string>;
}): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const other = new Set(right);
  return left.every((value) => other.has(value));
};

const testKey = ({ run }: { readonly run: ResolveCheckRun }): string =>
  `${run.command}::${run.testIdentity ?? ''}`;

const latestOf = ({
  receipts,
}: {
  readonly receipts: ReadonlyArray<ResolveCheckReceipt>;
}): ResolveCheckReceipt | null =>
  receipts.reduce<ResolveCheckReceipt | null>(
    (latest, receipt) =>
      latest === null || receipt.run.createdAt >= latest.run.createdAt ? receipt : latest,
    null,
  );

const verdictOf = ({
  receipts,
}: {
  readonly receipts: ReadonlyArray<ResolveCheckReceipt>;
}): ResolveChecksVerdict => {
  if (receipts.length === 0) {
    return { kind: 'nothing_ran' };
  }
  const fresh = receipts.filter((receipt) => !receipt.isStale);
  if (fresh.length === 0) {
    return { kind: 'all_stale' };
  }
  const onCandidate = latestOf({
    receipts: fresh.filter((receipt) => receipt.tree === 'candidate'),
  });
  if (onCandidate === null) {
    return { kind: 'base_only' };
  }
  if (onCandidate.run.outcome !== 'passed') {
    return { kind: 'fails_on_the_proposal' };
  }
  const identity = onCandidate.run.testIdentity;
  const onBase = latestOf({
    receipts: fresh.filter(
      (receipt) =>
        receipt.tree === 'base' &&
        testKey({ run: receipt.run }) === testKey({ run: onCandidate.run }),
    ),
  });
  if (onBase === null) {
    return { kind: 'passes_without_base_run', testIdentity: identity };
  }
  if (onBase.run.outcome === 'passed') {
    return { kind: 'passes_on_both', testIdentity: identity };
  }
  return { kind: 'proves_the_fix', testIdentity: identity };
};

export const summariseResolveChecks = ({
  runs,
  candidate,
  acceptedSet,
}: Params): ResolveChecksSummary => {
  const receipts: ReadonlyArray<ResolveCheckReceipt> = runs.map((run) => {
    const isBaseTreeStale = candidate === null || run.baseTree !== candidate.baseSha;
    const isCandidateTreeStale =
      run.candidateTree !== null &&
      (candidate === null || run.candidateTree !== candidate.candidateSha);
    return {
      run,
      tree: run.candidateTree === null ? 'base' : 'candidate',
      isStale:
        isBaseTreeStale ||
        isCandidateTreeStale ||
        !sameSet({ left: run.acceptedSet, right: acceptedSet }),
    };
  });
  return {
    receipts,
    verdict: verdictOf({ receipts }),
    isScoped: receipts.some((receipt) => !receipt.isStale && receipt.run.breadth === 'scoped'),
  };
};
