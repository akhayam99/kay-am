import { AlertTriangle, CheckCheck, Inbox } from 'lucide-react';
import { Button, EmptyState } from '@goodboy/ui';

type NothingWaitingProps = {
  readonly onOpenSpawn: () => void;
};

export const NothingWaitingState = ({ onOpenSpawn }: NothingWaitingProps) => (
  <EmptyState
    icon={CheckCheck}
    tone="success"
    title="Nothing is waiting on you"
    description="Every review comment on this pull request has an answer."
    action={
      <Button size="sm" variant="secondary" onClick={onOpenSpawn}>
        Start a resolve run
      </Button>
    }
  />
);

type NoPullRequestProps = {
  readonly onOpenReview: () => void;
};

export const NoResolveTargetState = ({ onOpenReview }: NoPullRequestProps) => (
  <EmptyState
    icon={Inbox}
    title="No pull request to resolve yet"
    description="Open a pull request or leave a note on a diff to see what is for you."
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
    title="Could not load what is for you"
    description={message}
    action={
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    }
  />
);
