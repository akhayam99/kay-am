import type { DiffComment } from '@goodboy/types';
import { Eyebrow } from '@goodboy/ui';
import { DiffCommentRow } from '../../../session/resolve/DiffCommentRow';

type Props = {
  readonly comments: ReadonlyArray<DiffComment>;
  readonly onOpen: () => void;
};

export const LocalNotesSection = ({ comments, onOpen }: Props) => {
  if (comments.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Eyebrow label={`Local notes ${comments.length}`} muted />
      <ul className="flex flex-col gap-1">
        {comments.map((comment) => (
          <DiffCommentRow key={comment.id} comment={comment} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
};
