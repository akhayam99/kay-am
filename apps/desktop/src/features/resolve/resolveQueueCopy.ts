import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';

export const RESOLVE_QUEUE_TITLE = 'Resolve';

export const RESOLVE_QUEUE_STATUS_LABEL: Record<ResolveQueueStatus, string> = {
  for_you: 'Needs review',
  agent_asked: 'Answer agent',
  working: 'Working',
  ready_to_push: 'Ready to publish',
  pushed: 'Completed',
  later: 'Later',
  changed_since_accepted: 'Review again',
  delivery_failed: 'Delivery failed',
  confirm_delivery: 'Confirm delivery',
  wont_fix: 'Will not fix',
  wont_fix_sent: 'Will not fix, reply sent',
};

export const RESOLVE_QUEUE_ACTION_LABEL = {
  resume: 'Resume',
  later: 'Later',
  approveFix: 'Approve fix',
  wontFix: 'Will not fix',
  askForChanges: 'Ask agent to revise',
  send: 'Send to agent',
  startRun: 'Start resolve run',
  openComment: 'Open comment',
  cancel: 'Cancel',
} as const;

export const RESOLVE_RUN_IN_PROGRESS = 'Resolve run in progress';

export const RESOLVE_COMMENT_UNAVAILABLE = 'Comment unavailable';

export const RESOLVE_HISTORY_LABEL = {
  later: 'Later',
  completed: 'Completed',
} as const;

export const RESOLVE_DELIVERY_SUPPORT = {
  replyPending: 'Reply pending',
  replyPosted: 'Reply posted',
  threadResolved: 'Thread resolved',
  threadLeftOpen: 'Thread left open',
} as const;

const countedLabel = ({
  label,
  count,
}: {
  readonly label: string;
  readonly count: number;
}): string => (count === 0 ? label : `${label} ${count}`);

export const needsReviewFilterLabel = ({ count }: { readonly count: number }): string =>
  countedLabel({ label: 'Needs review', count });

export const activeFilterLabel = ({ count }: { readonly count: number }): string =>
  countedLabel({ label: 'Active', count });

export const sharedRunHeading = ({ count }: { readonly count: number }): string =>
  `Shared run · ${count} ${count === 1 ? 'comment' : 'comments'}`;
