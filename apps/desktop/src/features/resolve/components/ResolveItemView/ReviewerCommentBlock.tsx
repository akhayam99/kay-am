import { cn } from '@goodboy/ui';
import type { ResolveQueueReviewerNote } from '../../buildResolveQueueRows';

type Props = {
  readonly note: ResolveQueueReviewerNote | null;
  readonly label: string;
  readonly isLead: boolean;
};

export const ReviewerCommentBlock = ({ note, label, isLead }: Props) => (
  <div className="flex min-w-0 flex-col gap-1">
    <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <blockquote
      className={cn(
        'flex min-w-0 flex-col gap-1 border-l-2 border-border pl-3',
        isLead ? 'text-sm text-foreground' : 'text-xs text-muted-foreground',
      )}
    >
      <p className="whitespace-pre-wrap break-words">
        {note?.body ?? 'No reviewer comment on this thread'}
      </p>
      <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
        {note?.author != null && <span className="truncate">{note.author}</span>}
        {note?.location != null && (
          <>
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <span className="truncate font-mono">{note.location}</span>
          </>
        )}
      </span>
    </blockquote>
  </div>
);
