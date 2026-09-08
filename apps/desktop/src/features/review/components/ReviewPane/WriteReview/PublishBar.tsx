import { useState } from 'react';
import { Button, Select, Textarea } from '@goodboy/ui';
import type { ReviewablePrProvider } from '@goodboy/types';
import type { PublishPrReviewVerdict } from '../../../../../store/slices/review-drafts/types';

type Props = {
  readonly provider: ReviewablePrProvider;
  readonly draftCount: number;
  readonly publishing: boolean;
  readonly onPublish: (opts: { verdict: PublishPrReviewVerdict; body: string }) => void;
};

export const PublishBar = ({ provider, draftCount, publishing, onPublish }: Props) => {
  const [verdict, setVerdict] = useState<PublishPrReviewVerdict>('comment');
  const [body, setBody] = useState('');
  const canPublish = !publishing && (draftCount > 0 || body.trim() !== '');

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Review summary (optional)"
          aria-label="Review summary"
          autoGrow
          minRows={1}
          maxRows={4}
          disabled={publishing}
          className="flex-1 text-xs"
        />
        {provider === 'github' ? (
          <Select
            size="md"
            aria-label="Review verdict"
            value={verdict}
            onChange={(event) => setVerdict(event.target.value as PublishPrReviewVerdict)}
            disabled={publishing}
          >
            <option value="comment">Comment</option>
            <option value="approve">Approve</option>
            <option value="request_changes">Request changes</option>
          </Select>
        ) : null}
        <Button
          onClick={() => onPublish({ verdict: provider === 'gitlab' ? 'comment' : verdict, body })}
          disabled={!canPublish}
        >
          {publishing ? 'Submitting…' : `Submit review (${draftCount})`}
        </Button>
      </div>
      {provider === 'gitlab' ? (
        <p className="text-2xs text-muted-foreground">
          Comments post as merge request discussions; the summary posts as a note.
        </p>
      ) : null}
    </div>
  );
};
