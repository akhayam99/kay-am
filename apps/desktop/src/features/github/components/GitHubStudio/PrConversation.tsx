import { useEffect, useMemo, useRef, useState } from 'react';
import type { PrComment, PullRequestState } from '@goodboy/types';
import { Button, EmptyState, cn } from '@goodboy/ui';
import { ExternalLink } from 'lucide-react';
import { type CommentThread, groupThreads, threadPriority } from '../../comment-threads';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { ConversationThread } from './ConversationThread';

type Props = {
  readonly comments: ReadonlyArray<PrComment>;
  readonly pr: PullRequestState;
  readonly scrollToThreadId?: string | null;
  readonly onOpenUrl: (url: string) => void;
  readonly onFix?: (thread: CommentThread) => void;
};

export const PrConversation = ({
  comments,
  pr,
  scrollToThreadId = null,
  onOpenUrl,
  onFix,
}: Props) => {
  const threads = useMemo(() => {
    const all = groupThreads(comments);
    return [...all].sort((a, b) => {
      const p = threadPriority(a) - threadPriority(b);
      if (p !== 0) {
        return p;
      }
      return b.head.createdAt.localeCompare(a.head.createdAt);
    });
  }, [comments]);

  const threadRefs = useRef(new Map<string, HTMLLIElement>());
  const [flashThreadId, setFlashThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToThreadId) {
      return;
    }
    const el = threadRefs.current.get(scrollToThreadId);
    if (!el) {
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashThreadId(scrollToThreadId);
    const t = setTimeout(() => setFlashThreadId(null), 1600);
    return () => clearTimeout(t);
  }, [scrollToThreadId, threads]);

  if (threads.length === 0) {
    return (
      <EmptyState
        bordered
        icon={CONCEPT_ICONS.comments}
        tone={CONCEPT_TONE.comments}
        title="No comments yet"
        description="Review comments and replies on this pull request will show up here."
        action={
          <Button variant="ghost" size="sm" onClick={() => onOpenUrl(pr.url)}>
            View conversation on GitHub
            <ExternalLink size={ICON_SIZE.row} aria-hidden />
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {threads.map((t) => {
          const tid = t.head.threadId ?? null;
          return (
            <li
              key={t.head.id}
              ref={(el) => {
                if (!tid) {
                  return;
                }
                if (el) {
                  threadRefs.current.set(tid, el);
                } else {
                  threadRefs.current.delete(tid);
                }
              }}
              className={cn(
                'rounded-lg transition-shadow',
                tid && tid === flashThreadId ? 'ring-2 ring-accent/60' : '',
              )}
            >
              <ConversationThread
                thread={t}
                onOpenUrl={onOpenUrl}
                {...(onFix !== undefined && { onFix: () => onFix(t) })}
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onOpenUrl(pr.url)}
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        open full conversation on GitHub
        <ExternalLink size={11} aria-hidden />
      </button>
    </div>
  );
};
