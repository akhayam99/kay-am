import { ExternalLink } from 'lucide-react';
import { Button, Chip, Tooltip } from '@goodboy/ui';
import type { CommentThread } from '../../comment-threads';
import { isBot } from '../../comment-threads';
import { formatRelativeAge } from '../../../../shared/utils/relativeDate';
import { Avatar } from '@goodboy/ui';
import { ThreadBody } from './ThreadBody';
import { ThreadPathChip } from './ThreadPathChip';
import { ThreadReplies } from './ThreadReplies';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly thread: CommentThread;
  readonly onOpenUrl: (url: string) => void;
  readonly onFix?: () => void;
};

export const OpenThread = ({ thread, onOpenUrl, onFix }: Props) => {
  const { head, replies } = thread;
  const open = head.source === 'review' && head.resolved === false;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-soft bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Avatar url={head.authorAvatarUrl} alt={head.author} />
        <span className="font-medium text-foreground">{head.author}</span>
        {isBot(head.author) ? (
          <span className="rounded bg-info/10 px-1 text-2xs uppercase tracking-wide text-info">
            bot
          </span>
        ) : null}
        <span className="opacity-50">·</span>
        <span>{formatRelativeAge({ fromIso: head.createdAt })}</span>
        {open ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-2xs font-medium text-warning">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
            open
          </span>
        ) : null}
        {head.outdated === true ? (
          <Chip
            tone="neutral"
            size="xs"
            label="Outdated"
            title="This comment is anchored to code that later commits changed"
          />
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          {onFix !== undefined ? (
            <Button size="sm" variant="ghost" onClick={onFix}>
              Fix
            </Button>
          ) : null}
          <Tooltip content="Open in browser">
            <button
              type="button"
              onClick={() => onOpenUrl(head.url)}
              aria-label="Open in browser"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink size={ICON_SIZE.row} aria-hidden />
            </button>
          </Tooltip>
        </span>
      </div>

      {head.path != null && head.path !== '' ? (
        <ThreadPathChip
          path={head.path}
          line={head.line ?? null}
          onOpen={() => onOpenUrl(head.url)}
        />
      ) : null}

      <div className="[overflow-wrap:anywhere]">
        <ThreadBody body={head.body} clamped={isBot(head.author)} />
      </div>

      <ThreadReplies replies={replies} />
    </div>
  );
};
