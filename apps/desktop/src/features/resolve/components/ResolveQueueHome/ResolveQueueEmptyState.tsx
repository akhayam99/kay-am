import { AlertTriangle, CheckCheck, Inbox } from 'lucide-react';
import { Button, EmptyState, FilledEmptyState } from '@goodboy/ui';

type NothingWaitingProps = {
  readonly hasOtherActiveWork: boolean;
};

export const NothingWaitingState = ({ hasOtherActiveWork }: NothingWaitingProps) => (
  <FilledEmptyState
    icon={CheckCheck}
    tone="neutral"
    title={hasOtherActiveWork ? 'No comments need review' : 'No active comments'}
  />
);

type NoPullRequestProps = {
  readonly onOpenReview: () => void;
};

export const NoResolveTargetState = ({ onOpenReview }: NoPullRequestProps) => (
  <EmptyState
    icon={Inbox}
    title="No pull request"
    description="Open Review to create or select a pull request."
    action={
      <Button size="sm" variant="secondary" onClick={onOpenReview}>
        Open review
      </Button>
    }
  />
);

type ErrorProps = {
  readonly message: string;
  readonly onRetry: () => void;
};

export const ResolveQueueErrorState = ({ message, onRetry }: ErrorProps) => (
  <EmptyState
    icon={AlertTriangle}
    tone="danger"
    title="Could not load comments"
    description={message}
    action={
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    }
  />
);
