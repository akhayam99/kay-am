import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Textarea, cn, tintClasses } from '@goodboy/ui';
import { formatCombo } from '../../../../../shared/keyboard/registry';
import { ComposerActionRow } from './ComposerActionRow';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

const SUBMIT_HINT = formatCombo('cmd+Enter');
const draftTint = tintClasses('draft');

type Props = {
  readonly label: string;
  readonly onSubmit: (body: string) => void;
  readonly onCancel: () => void;
};

export const LineComposer = ({ label, onSubmit, onCancel }: Props) => {
  const [body, setBody] = useState('');
  const trimmed = body.trim();
  return (
    <div className="flex gap-2">
      <MessageSquarePlus
        size={ICON_SIZE.row}
        aria-hidden
        className={cn('shrink-0', draftTint.icon)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-3xs font-medium text-muted-foreground">{label}</span>
        <Textarea
          autoFocus
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={`Draft a review comment… (${SUBMIT_HINT} to add)`}
          aria-label="Draft comment body"
          className="text-xs"
          autoGrow
          maxRows={6}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (trimmed.length > 0) {
                onSubmit(trimmed);
              }
            }
          }}
        />
        <ComposerActionRow
          saveLabel="Add draft"
          disabled={trimmed.length === 0}
          onCancel={onCancel}
          onSave={() => trimmed.length > 0 && onSubmit(trimmed)}
        />
      </div>
    </div>
  );
};
