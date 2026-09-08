import type {
  PullRequestState,
  Session,
  SessionPrFetchState,
  SessionStageInfo,
} from '@goodboy/types';

type Params = {
  session: Session;
  pr: PullRequestState | null;
  hasUnread: boolean;
  openQuestionCount: number;
  hasRunningAgent?: boolean;
  isDecidingWorkflow?: boolean;
  isPrReview?: boolean;
  isBranchless?: boolean;
  requestLabel?: string;
  prFetchState?: SessionPrFetchState;
  remainingWork?: number;
  remainingReason?: string | null;
};

const isPrLive = (pr: PullRequestState | null): pr is PullRequestState =>
  pr !== null && pr.state !== 'merged' && pr.state !== 'closed';

const isPrApproved = (pr: PullRequestState): boolean =>
  !pr.isDraft && (pr.state === 'approved' || pr.reviewDecision === 'approved');

export const deriveSessionStage = ({
  session,
  pr,
  hasUnread,
  openQuestionCount,
  hasRunningAgent = false,
  isDecidingWorkflow = false,
  isPrReview = false,
  isBranchless = false,
  requestLabel,
  prFetchState = 'known',
  remainingWork = 0,
  remainingReason = null,
}: Params): SessionStageInfo => {
  const label = requestLabel ?? (pr === null ? '' : `PR #${pr.number}`);
  if (isBranchless) {
    if (session.state.kind === 'running' || session.state.kind === 'starting' || hasRunningAgent) {
      return { stage: 'running', reason: 'agent running', attention: null };
    }
    if (isDecidingWorkflow) {
      return { stage: 'running', reason: 'deciding the next step', attention: null };
    }
    if (session.state.kind === 'error') {
      return { stage: 'attention', reason: 'agent errored', attention: 'agent-error' };
    }
    if (openQuestionCount === 1) {
      return { stage: 'attention', reason: '1 open question', attention: 'open-question' };
    }
    if (openQuestionCount > 1) {
      return {
        stage: 'attention',
        reason: `${openQuestionCount} open questions`,
        attention: 'open-question',
      };
    }
    if (hasUnread) {
      return { stage: 'attention', reason: 'unread agent reply', attention: 'unread-reply' };
    }
    return { stage: 'building', reason: 'ready for work', attention: null };
  }
  if (session.state.kind === 'error') {
    return { stage: 'attention', reason: 'agent errored', attention: 'agent-error' };
  }
  if (session.state.kind === 'running' || session.state.kind === 'starting') {
    return { stage: 'running', reason: 'agent running', attention: null };
  }
  if (hasRunningAgent) {
    return { stage: 'running', reason: 'agent running', attention: null };
  }
  if (isDecidingWorkflow) {
    return { stage: 'running', reason: 'deciding the next step', attention: null };
  }
  if (isPrLive(pr) && pr.checks === 'failure') {
    return { stage: 'attention', reason: `${label}: CI failed`, attention: 'ci-failed' };
  }
  if (isPrLive(pr) && pr.reviewDecision === 'changes_requested') {
    return {
      stage: 'attention',
      reason: `${label}: changes requested`,
      attention: 'changes-requested',
    };
  }
  if (openQuestionCount === 1) {
    return { stage: 'attention', reason: '1 open question', attention: 'open-question' };
  }
  if (openQuestionCount > 1) {
    return {
      stage: 'attention',
      reason: `${openQuestionCount} open questions`,
      attention: 'open-question',
    };
  }
  if (isPrLive(pr) && isPrApproved(pr)) {
    return {
      stage: 'attention',
      reason: `${label} approved, ready to merge`,
      attention: 'pr-approved',
    };
  }
  if (hasUnread) {
    return { stage: 'attention', reason: 'unread agent reply', attention: 'unread-reply' };
  }
  if (isPrReview && pr === null) {
    return { stage: 'review', reason: 'reviewing an external PR', attention: null };
  }
  if (pr === null && prFetchState === 'unknown') {
    return { stage: 'building', reason: 'checking GitHub', attention: null };
  }
  if (pr === null && prFetchState === 'unreachable') {
    return { stage: 'building', reason: 'GitHub unreachable', attention: null };
  }
  if (pr === null) {
    return { stage: 'building', reason: 'no PR yet', attention: null };
  }
  if (pr.state === 'merged' || pr.state === 'closed') {
    const settled = pr.state === 'merged' ? 'merged' : 'closed';
    if (remainingWork > 0) {
      return {
        stage: 'review',
        reason: `${label} ${settled}, ${remainingReason ?? `${remainingWork} still open`}`,
        attention: null,
      };
    }
    return { stage: 'done', reason: `${label} ${settled}`, attention: null };
  }
  if (pr.isDraft) {
    return { stage: 'review', reason: `draft ${label}`, attention: null };
  }
  if (pr.checks === 'pending') {
    return { stage: 'review', reason: `${label}: CI running`, attention: null };
  }
  return { stage: 'review', reason: `${label} awaiting review`, attention: null };
};
