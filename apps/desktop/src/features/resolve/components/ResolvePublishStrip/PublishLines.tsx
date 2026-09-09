import { useState } from 'react';
import { Collapsible } from '@goodboy/ui';
import type { ResolvePublicationPreview } from '@goodboy/types';
import { excludedLine, heldBackNote, publicationCountsLine } from '../../resolvePublishCopy';
import { RESOLVE_DELIVERY_SUPPORT } from '../../resolveQueueCopy';

type Props = {
  readonly preview: ResolvePublicationPreview;
};

export const PublishLines = ({ preview }: Props) => {
  const [areRepliesShown, setAreRepliesShown] = useState(false);
  const counts = publicationCountsLine({ preview });
  const held = heldBackNote({ preview });
  const excluded = excludedLine({ preview });
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {counts !== null && (
        <p className="text-2xs tabular-nums text-foreground/80">
          {counts}
          {held !== null && <span className="text-warning">{` · ${held}`}</span>}
        </p>
      )}
      {counts === null && excluded !== null && (
        <p className="text-2xs text-muted-foreground">{excluded}</p>
      )}
      {preview.replies.length > 0 && (
        <Collapsible
          open={areRepliesShown}
          onOpenChange={setAreRepliesShown}
          trigger={`Replies (${preview.replies.length})`}
        >
          <ul className="flex flex-col gap-2">
            {preview.replies.map((reply) => (
              <li key={reply.threadId} className="flex min-w-0 flex-col gap-1">
                <span className="text-3xs text-muted-foreground">
                  {reply.closes
                    ? RESOLVE_DELIVERY_SUPPORT.threadResolved
                    : RESOLVE_DELIVERY_SUPPORT.threadLeftOpen}
                </span>
                <p className="whitespace-pre-wrap break-words text-2xs text-foreground/80">
                  {reply.body}
                </p>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
};
