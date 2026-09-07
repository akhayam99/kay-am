import { ExternalLink, RotateCcw } from 'lucide-react';
import { GhostActionButton, SectionSurface } from '@goodboy/ui';

type Props = {
  readonly error: string | null;
  readonly hasPostedReply: boolean;
  readonly isPublishing: boolean;
  readonly onRetryPublish: () => void;
  readonly onReviewOnGithub: () => void;
};

export const PublicationSection = ({
  error,
  hasPostedReply,
  isPublishing,
  onRetryPublish,
  onReviewOnGithub,
}: Props) => {
  if (error === null && !isPublishing) {
    return null;
  }
  return (
    <SectionSurface label="Publication">
      {isPublishing ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Publishing this conversation.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-foreground">{error}</p>
          {hasPostedReply && (
            <p className="text-2xs text-muted-foreground">Reply posted, closing failed.</p>
          )}
          <div className="flex items-center gap-2">
            <GhostActionButton
              icon={RotateCcw}
              label="Retry publish"
              tone="warning"
              onClick={onRetryPublish}
            />
            <GhostActionButton
              icon={ExternalLink}
              label="Review on GitHub"
              onClick={onReviewOnGithub}
            />
          </div>
        </>
      )}
    </SectionSurface>
  );
};
