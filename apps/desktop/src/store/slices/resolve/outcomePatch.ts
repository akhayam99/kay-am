import type { ResolveThread } from '@goodboy/types';
import type { ResolverThreadOutcome } from '../../../features/session/resolverTurnOutcomes';

type Params = { readonly outcome: ResolverThreadOutcome; readonly verdict?: 'fix' | 'wontfix' };

export const outcomePatch = ({ outcome, verdict }: Params): Partial<ResolveThread> => {
  if (outcome.kind === 'resolved') {
    return {
      state: 'fixed',
      stateReason: null,
      disposition: 'fix',
      commitShas: [outcome.commitSha],
      replyDraft: outcome.reply ?? null,
      question: null,
    };
  }
  if (outcome.kind === 'wontfix') {
    return {
      state: 'answered',
      stateReason: `wontfix:${outcome.reason}`,
      disposition: 'no_change',
      commitShas: null,
      replyDraft: outcome.reply ?? outcome.reason,
      question: null,
    };
  }
  const analysisVerdict = outcome.verdict ?? verdict;
  return {
    state: analysisVerdict === 'wontfix' ? 'answered' : 'needs_answer',
    stateReason:
      analysisVerdict === 'fix'
        ? 'proposed_fix'
        : analysisVerdict === 'wontfix'
          ? 'analysis_wontfix'
          : 'review_legacy_result',
    disposition: analysisVerdict === 'wontfix' ? 'no_change' : 'reply',
    commitShas: null,
    replyDraft: outcome.reply ?? null,
    question: null,
  };
};
