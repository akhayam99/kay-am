import { Markdown } from '@goodboy/ui';
import { RESOLVE_COMMENT_UNAVAILABLE } from '../../resolveQueueCopy';
import type { ResolveQueueReviewerNote } from '../../buildResolveQueueRows';

type Props = {
  readonly note: ResolveQueueReviewerNote | null;
};

export const ReviewerCommentBlock = ({ note }: Props) => (
  <div className="flex min-w-0 max-w-[65ch] flex-col gap-2">
    {note === null ? (
      <p className="text-sm text-muted-foreground">{RESOLVE_COMMENT_UNAVAILABLE}</p>
    ) : (
      <Markdown text={note.body} variant="preview" className="text-sm text-foreground" />
    )}
    {note !== null && (
      <span className="flex min-w-0 items-center gap-2 text-3xs text-muted-foreground">
        <span className="shrink-0 truncate">{note.author}</span>
        {note.location != null && (
          <span className="min-w-0 truncate font-mono">{note.location}</span>
        )}
      </span>
    )}
  </div>
);
