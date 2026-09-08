import type { CommentThread } from '../../comment-threads';
import { OpenThread } from './OpenThread';
import { ResolvedThread } from './ResolvedThread';

type Props = {
  readonly thread: CommentThread;
  readonly onOpenUrl: (url: string) => void;
  readonly onFix?: () => void;
};

export const ConversationThread = ({ thread, onOpenUrl, onFix }: Props) => {
  const { head } = thread;
  const resolved = head.source === 'review' && head.resolved === true;

  if (resolved) {
    return <ResolvedThread thread={thread} onOpenUrl={onOpenUrl} />;
  }
  return (
    <OpenThread thread={thread} onOpenUrl={onOpenUrl} {...(onFix !== undefined && { onFix })} />
  );
};
