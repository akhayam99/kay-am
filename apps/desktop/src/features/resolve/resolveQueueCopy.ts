import type { ResolveQueueStatus } from '../../store/slices/resolve/deriveResolveQueueStatus';

export const RESOLVE_QUEUE_STATUS_LABEL: Record<ResolveQueueStatus, string> = {
  for_you: 'For you',
  agent_asked: 'Agent asked you',
  working: 'Working',
  ready_to_push: 'Ready to push',
  pushed: 'Pushed and posted',
  later: 'Later',
  changed_since_accepted: 'Changed since you accepted',
};

export const RESOLVE_QUEUE_ACTION_LABEL = {
  treatAsOneFix: 'Treat as one fix',
  takeUp: 'Take up',
  later: 'Later',
  askForChanges: 'Ask for changes',
  send: 'Send',
  acceptAll: 'Accept all',
} as const;

export const forYouHeading = ({ count }: { readonly count: number }): string =>
  `${count} for you`;

export const acceptFixLabel = ({ coveredCount }: { readonly coveredCount: number }): string =>
  coveredCount > 1 ? `Accept fix (${coveredCount})` : 'Accept fix';

export const secondaryStatusLine = ({
  workingCount,
  readyToPushCount,
}: {
  readonly workingCount: number;
  readonly readyToPushCount: number;
}): string =>
  `${workingCount} working · ${readyToPushCount} ready to push`;

export const coversSeveralSentence = ({
  coveredCount,
}: {
  readonly coveredCount: number;
}): string | null =>
  coveredCount > 1 ? `This proposal also covers ${coveredCount - 1} other comment${coveredCount - 1 === 1 ? '' : 's'}.` : null;
