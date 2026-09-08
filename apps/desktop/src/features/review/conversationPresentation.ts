import type { Tone } from '@goodboy/ui';
import type { ResolveAttempt, ResolveThread } from '@goodboy/types';
import { decodeStateReason } from './stateReason';

export type ConversationBadge = 'open' | 'working' | 'needs_you' | 'ready' | 'resolved';

export type ConversationVerb =
  | 'fix'
  | 'fix_separately'
  | 'answer'
  | 'retry'
  | 'retry_publish'
  | 'recheck_fix'
  | 'review_changes'
  | 'publish'
  | 'edit_reply'
  | 'write_reply'
  | 'view_work'
  | 'view_progress'
  | 'view_changes'
  | 'view_on_github'
  | 'cancel_run'
  | 'stop_run';

export const VERB_LABEL: Record<ConversationVerb, string> = {
  fix: 'Fix',
  fix_separately: 'Fix separately',
  answer: 'Answer',
  retry: 'Retry',
  retry_publish: 'Retry publish',
  recheck_fix: 'Recheck fix',
  review_changes: 'Review changes',
  publish: 'Publish',
  edit_reply: 'Edit reply',
  write_reply: 'Write reply',
  view_work: 'View work',
  view_progress: 'View progress',
  view_changes: 'View changes',
  view_on_github: 'View on GitHub',
  cancel_run: 'Cancel run',
  stop_run: 'Stop run',
};

export const BADGE_LABEL: Record<ConversationBadge, string> = {
  open: 'Open',
  working: 'Working',
  needs_you: 'Needs you',
  ready: 'Ready',
  resolved: 'Resolved',
};

export const BADGE_TONE: Record<ConversationBadge, Tone> = {
  open: 'neutral',
  working: 'info',
  needs_you: 'warning',
  ready: 'success',
  resolved: 'merged',
};

export type ConversationPresentation = {
  readonly badge: ConversationBadge;
  readonly supporting: string | null;
  readonly primary: ConversationVerb;
  readonly secondary: ReadonlyArray<ConversationVerb>;
  readonly isPublishable: boolean;
  readonly isFixable: boolean;
  readonly isSelectable: boolean;
  readonly isRunning: boolean;
  readonly isWaiting: boolean;
  readonly elapsedFrom: number | null;
};

type Params = {
  readonly row: ResolveThread | null;
  readonly attempt?: ResolveAttempt | null;
  readonly isLeaseWaiting?: boolean;
  readonly isWriterBusy?: boolean;
  readonly branchShas?: ReadonlySet<string> | null;
  readonly isOrphan?: boolean;
  readonly isResolvedOnGithub?: boolean;
};

const resolvedPresentation = ({
  supporting,
}: {
  readonly supporting: string;
}): ConversationPresentation => ({
  badge: 'resolved',
  supporting,
  primary: 'view_on_github',
  secondary: ['view_work'],
  isPublishable: false,
  isFixable: false,
  isSelectable: false,
  isRunning: false,
  isWaiting: false,
  elapsedFrom: null,
});

const OPEN: ConversationPresentation = {
  badge: 'open',
  supporting: null,
  primary: 'fix',
  secondary: ['write_reply', 'fix_separately'],
  isPublishable: false,
  isFixable: true,
  isSelectable: true,
  isRunning: false,
  isWaiting: false,
  elapsedFrom: null,
};

const firstLine = ({ text }: { readonly text: string }): string => {
  const line = text.trim().split('\n')[0] ?? '';
  return line.trim();
};

const hasMissingSha = ({
  row,
  branchShas,
}: {
  readonly row: ResolveThread;
  readonly branchShas: ReadonlySet<string> | null | undefined;
}): boolean => {
  if (branchShas === null || branchShas === undefined || branchShas.size === 0) {
    return false;
  }
  const shas = row.commitShas ?? [];
  return shas.length > 0 && shas.some((sha) => !branchShas.has(sha));
};

const workingPresentation = ({
  row,
  attempt,
  isLeaseWaiting,
}: {
  readonly row: ResolveThread;
  readonly attempt: ResolveAttempt | null | undefined;
  readonly isLeaseWaiting: boolean;
}): ConversationPresentation => {
  const isQueued = attempt?.phase === 'queued' || isLeaseWaiting;
  if (isQueued) {
    return {
      badge: 'working',
      supporting: 'Waiting for current work',
      primary: 'view_work',
      secondary: ['cancel_run'],
      isPublishable: false,
      isFixable: false,
      isSelectable: false,
      isRunning: false,
      isWaiting: true,
      elapsedFrom: null,
    };
  }
  const decoded = decodeStateReason({ stateReason: row.stateReason });
  return {
    badge: 'working',
    supporting: decoded.isCandidate ? 'Fix committed, checking' : null,
    primary: 'view_work',
    secondary: ['stop_run'],
    isPublishable: false,
    isFixable: false,
    isSelectable: false,
    isRunning: true,
    isWaiting: false,
    elapsedFrom: attempt?.startedAt ?? null,
  };
};

const needsAnswerPresentation = ({
  row,
  reason,
}: {
  readonly row: ResolveThread;
  readonly reason: string | null;
}): ConversationPresentation => {
  const base = {
    badge: 'needs_you',
    isPublishable: false,
    isSelectable: false,
    isRunning: false,
    isWaiting: false,
    elapsedFrom: null,
  } as const;
  if (reason === 'proposed_fix') {
    return {
      ...base,
      supporting: 'Change proposed',
      primary: 'fix',
      secondary: ['write_reply', 'retry'],
      isFixable: true,
    };
  }
  if (reason === 'review_legacy_result') {
    return {
      ...base,
      supporting: 'Result needs a look',
      primary: 'retry',
      secondary: ['write_reply', 'view_work'],
      isFixable: false,
    };
  }
  const question = row.question === null ? '' : firstLine({ text: row.question });
  return {
    ...base,
    supporting: question === '' ? 'Waiting on your answer' : question,
    primary: 'answer',
    secondary: ['write_reply', 'retry'],
    isFixable: false,
  };
};

const failedPresentation = ({
  prefix,
  reason,
}: {
  readonly prefix: string | null;
  readonly reason: string | null;
}): ConversationPresentation => {
  const base = {
    badge: 'needs_you',
    isPublishable: false,
    isFixable: false,
    isSelectable: false,
    isRunning: false,
    isWaiting: false,
    elapsedFrom: null,
  } as const;
  if (prefix === 'dirty_tree') {
    return {
      ...base,
      supporting: 'Uncommitted changes in the worktree',
      primary: 'review_changes',
      secondary: ['retry'],
    };
  }
  if (prefix === 'stopped') {
    return {
      ...base,
      supporting: 'Stopped',
      primary: 'retry',
      secondary: ['write_reply', 'view_work'],
    };
  }
  if (reason === 'interrupted') {
    return {
      ...base,
      supporting: 'Interrupted',
      primary: 'retry',
      secondary: ['write_reply', 'view_work'],
    };
  }
  return {
    ...base,
    supporting: 'No result',
    primary: 'retry',
    secondary: ['write_reply', 'view_work'],
  };
};

const settledPresentation = ({
  row,
  isWriterBusy,
  branchShas,
}: {
  readonly row: ResolveThread;
  readonly isWriterBusy: boolean;
  readonly branchShas: ReadonlySet<string> | null | undefined;
}): ConversationPresentation => {
  if (row.state === 'fixed') {
    if (hasMissingSha({ row, branchShas })) {
      return {
        badge: 'needs_you',
        supporting: 'Fix changed since review',
        primary: 'recheck_fix',
        secondary: ['view_changes', 'retry'],
        isPublishable: false,
        isFixable: false,
        isSelectable: false,
        isRunning: false,
        isWaiting: false,
        elapsedFrom: null,
      };
    }
    return {
      badge: 'ready',
      supporting: 'Fix committed',
      primary: 'publish',
      secondary: ['edit_reply', 'view_changes', 'retry'],
      isPublishable: !isWriterBusy,
      isFixable: false,
      isSelectable: true,
      isRunning: false,
      isWaiting: false,
      elapsedFrom: null,
    };
  }
  return {
    badge: 'ready',
    supporting: row.disposition === 'no_change' ? 'No change needed' : 'Reply prepared',
    primary: 'publish',
    secondary: ['edit_reply', 'retry'],
    isPublishable: true,
    isFixable: false,
    isSelectable: true,
    isRunning: false,
    isWaiting: false,
    elapsedFrom: null,
  };
};

export const conversationPresentation = ({
  row,
  attempt,
  isLeaseWaiting = false,
  isWriterBusy = false,
  branchShas,
  isOrphan = false,
  isResolvedOnGithub = false,
}: Params): ConversationPresentation => {
  if (isOrphan) {
    return resolvedPresentation({ supporting: 'Not on this pull request' });
  }
  if (row === null) {
    return isResolvedOnGithub ? resolvedPresentation({ supporting: 'Resolved elsewhere' }) : OPEN;
  }
  if (row.state === 'open') {
    return OPEN;
  }
  const decoded = decodeStateReason({ stateReason: row.stateReason });
  if (row.state === 'closed') {
    return resolvedPresentation({
      supporting: row.closedSource === 'github' ? 'Resolved elsewhere' : 'On GitHub',
    });
  }
  if (row.state === 'publishing') {
    return {
      badge: 'working',
      supporting: 'Publishing',
      primary: 'view_progress',
      secondary: ['view_on_github'],
      isPublishable: false,
      isFixable: false,
      isSelectable: false,
      isRunning: false,
      isWaiting: false,
      elapsedFrom: null,
    };
  }
  if (decoded.publicationError !== null) {
    return {
      badge: 'needs_you',
      supporting: `Publish failed: ${decoded.publicationError}`,
      primary: 'retry_publish',
      secondary: ['view_on_github', 'edit_reply'],
      isPublishable: false,
      isFixable: false,
      isSelectable: false,
      isRunning: false,
      isWaiting: false,
      elapsedFrom: null,
    };
  }
  if (row.state === 'working') {
    return workingPresentation({ row, attempt, isLeaseWaiting });
  }
  if (row.state === 'needs_answer') {
    return needsAnswerPresentation({ row, reason: decoded.reason });
  }
  if (row.state === 'failed') {
    return failedPresentation({ prefix: decoded.prefix, reason: decoded.reason });
  }
  return settledPresentation({ row, isWriterBusy, branchShas });
};
