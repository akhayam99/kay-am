import { useEffect, useState, type KeyboardEvent } from 'react';
import { GhostActionButton, Markdown, SectionSurface, Textarea } from '@goodboy/ui';
import { Pencil } from 'lucide-react';

type Props = {
  readonly threadId: string;
  readonly reply: string | null;
  readonly isClosingReason: boolean;
  readonly isReadOnly: boolean;
  readonly onSave: (params: { readonly threadId: string; readonly reply: string }) => void;
};

const labelFor = ({
  reply,
  isClosingReason,
}: {
  readonly reply: string | null;
  readonly isClosingReason: boolean;
}): string => {
  if (reply === null || reply.trim() === '') {
    return 'Write reply';
  }
  return isClosingReason ? 'Closing reason' : 'Proposed reply';
};

export const ReplySection = ({ threadId, reply, isClosingReason, isReadOnly, onSave }: Props) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(reply ?? '');
  useEffect(() => {
    setIsEditing(false);
    setDraft(reply ?? '');
  }, [reply, threadId]);
  const label = labelFor({ reply, isClosingReason });
  const isEmpty = reply === null || reply.trim() === '';
  const commit = () => {
    setIsEditing(false);
    if (draft.trim() === (reply ?? '').trim()) {
      return;
    }
    onSave({ threadId, reply: draft });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    commit();
  };
  if (isReadOnly && isEmpty) {
    return null;
  }
  return (
    <SectionSurface
      label={label}
      action={
        isReadOnly || isEditing || isEmpty ? undefined : (
          <GhostActionButton icon={Pencil} label="Edit reply" onClick={() => setIsEditing(true)} />
        )
      }
    >
      {isReadOnly ? (
        <Markdown text={reply ?? ''} className="text-sm leading-relaxed" />
      ) : isEditing || isEmpty ? (
        <Textarea
          autoGrow
          minRows={2}
          maxRows={12}
          value={draft}
          aria-label={label}
          placeholder="Type a reply to post without a fix"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <Markdown text={reply ?? ''} className="text-sm leading-relaxed" />
      )}
    </SectionSurface>
  );
};
