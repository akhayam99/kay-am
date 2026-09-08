import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Chip, cn, Textarea, Tooltip } from '@goodboy/ui';
import type { PrReviewDraft } from '@goodboy/types';
import { ComposerActionRow } from './ComposerActionRow';

type Props = {
  readonly draft: PrReviewDraft;
  readonly onEdit: (body: string) => void;
  readonly onDiscard: () => void;
};

export const DraftCard = ({ draft, onEdit, onDiscard }: Props) => {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const trimmed = body.trim();

  const startEditing = () => {
    setBody(draft.body);
    setEditing(true);
  };

  const save = () => {
    if (trimmed.length === 0) {
      return;
    }
    onEdit(trimmed);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md border-l-2 bg-muted/20 px-3 py-2',
        draft.stale ? 'border-warning/70 opacity-70' : 'border-draft/50',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
          {draft.path}:{draft.line}
        </span>
        <Chip
          tone={draft.origin === 'agent' ? 'draft' : 'neutral'}
          size="3xs"
          bordered={false}
          label={draft.origin === 'agent' ? 'Agent' : 'You'}
          className="shrink-0"
        />
        {draft.stale ? (
          <Chip
            tone="warning"
            size="3xs"
            bordered={false}
            label="Stale"
            title="The diff changed under this comment; it will be skipped on publish"
            className="shrink-0"
          />
        ) : null}
        <span className="flex-1" />
        <Tooltip content="Discard draft">
          <button
            type="button"
            onClick={onDiscard}
            aria-label={`Discard draft on ${draft.path}:${draft.line}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
          >
            <Trash2 size={11} aria-hidden />
          </button>
        </Tooltip>
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          <Textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            aria-label="Edit draft comment"
            className="text-xs"
            autoGrow
            maxRows={8}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setEditing(false);
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                save();
              }
            }}
          />
          <ComposerActionRow
            saveLabel="Save"
            disabled={trimmed.length === 0}
            onCancel={() => setEditing(false)}
            onSave={save}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          title="Edit draft"
          className="whitespace-pre-wrap rounded-sm text-left text-xs leading-relaxed text-foreground/85 transition-colors hover:bg-muted/40"
        >
          {draft.body}
        </button>
      )}
    </div>
  );
};
