import type { PrComment } from '@goodboy/types';
import { Avatar, Chip, SectionSurface, Tooltip } from '@goodboy/ui';
import { formatRelativeAge } from '../../../../../shared/utils/relativeDate';
import { ThreadBody } from '../../../../github/components/GitHubStudio/ThreadBody';
import { ThreadReplies } from '../../../../github/components/GitHubStudio/ThreadReplies';

type Props = {
  readonly head: PrComment | null;
  readonly replies: ReadonlyArray<PrComment>;
};

export const ConversationSection = ({ head, replies }: Props) => {
  if (head === null) {
    return null;
  }
  return (
    <SectionSurface label="Conversation">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Avatar url={head.authorAvatarUrl} alt={head.author} />
          <span className="font-medium text-foreground">{head.author}</span>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span>{formatRelativeAge({ fromIso: head.createdAt })}</span>
          {head.outdated === true && (
            <Tooltip content="The line this comment points at has changed since it was written">
              <span>
                <Chip size="3xs" tone="warning" label="Outdated" />
              </span>
            </Tooltip>
          )}
        </div>
        <div className="[overflow-wrap:anywhere]">
          <ThreadBody body={head.body} clamped={false} />
        </div>
        <ThreadReplies replies={replies} />
      </div>
    </SectionSurface>
  );
};
