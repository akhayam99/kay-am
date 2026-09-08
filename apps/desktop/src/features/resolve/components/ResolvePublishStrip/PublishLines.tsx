import type { ResolvePublicationPreview } from '@goodboy/types';
import {
  commitsLine,
  excludedLine,
  heldBackNote,
  notesLine,
  repliesLine,
} from '../../resolvePublishCopy';

type Props = {
  readonly preview: ResolvePublicationPreview;
};

export const PublishLines = ({ preview }: Props) => {
  const commits = commitsLine({ preview });
  const replies = repliesLine({ preview });
  const notes = notesLine({ preview });
  const held = heldBackNote({ preview });
  const excluded = excludedLine({ preview });
  return (
    <ul className="flex flex-col gap-0.5">
      {commits !== null && <li className="text-2xs text-foreground/80">{commits}</li>}
      {replies !== null && (
        <li className="text-2xs text-foreground/80">
          {replies}
          {held !== null && <span className="text-warning">{` · ${held}`}</span>}
        </li>
      )}
      {notes !== null && <li className="text-2xs text-foreground/80">{notes}</li>}
      {commits === null && replies === null && notes === null && excluded !== null && (
        <li className="text-2xs text-muted-foreground">{excluded}</li>
      )}
    </ul>
  );
};
