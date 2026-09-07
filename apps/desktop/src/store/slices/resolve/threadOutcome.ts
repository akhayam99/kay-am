import { resolveOutcomeReason } from './resolveOutcomeReason';
import type { ResolveThread } from '@goodboy/types';
import type { ResolverThreadOutcome } from '../../types';

type Params = { readonly row: ResolveThread; readonly shouldIncludeCandidate?: boolean };

export const threadOutcome = ({
  row,
  shouldIncludeCandidate = false,
}: Params): ResolverThreadOutcome | null => {
  const savedReason =
    resolveOutcomeReason({ stateReason: row.stateReason })?.replace(
      /^(?:(?:missing_result|stopped|failed):)+/,
      '',
    ) ?? null;
  const isCandidate = savedReason?.startsWith('candidate:') === true;
  if (isCandidate && !shouldIncludeCandidate) {
    return null;
  }
  const stateReason = isCandidate ? (savedReason?.slice(10) ?? null) : savedReason;
  const reply = row.replyDraft === null ? {} : { reply: row.replyDraft };
  if (row.disposition === 'fix' && row.commitShas?.[0] !== undefined) {
    return { kind: 'resolved', commitSha: row.commitShas[0], ...reply };
  }
  if (stateReason?.startsWith('wontfix:') === true || stateReason === 'legacy_wontfix') {
    const reason = stateReason === 'legacy_wontfix' ? (row.replyDraft ?? '') : stateReason.slice(8);
    return { kind: 'wontfix', reason, ...(row.replyDraft !== reason && reply) };
  }
  if (row.disposition === 'reply' || row.disposition === 'no_change') {
    return {
      kind: 'analyzed',
      ...reply,
      ...(stateReason === 'proposed_fix' && { verdict: 'fix' }),
    };
  }
  return null;
};
