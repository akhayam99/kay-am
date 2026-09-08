import type { MountId, SessionId } from '@goodboy/types';
import { PrDetailPanel } from '../GitHubStudio/PrDetailPanel';
import { StudioShell } from '../../../../shared/components/StudioShell';
import { CONCEPT_ICONS } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly workspaceName: string;
  readonly initialPrNumber?: number | null;
  readonly initialThreadId?: string | null;
  readonly mountId?: MountId | null;
  readonly onClose: () => void;
};

export const GitHubSessionPane = ({
  sessionId,
  workspaceName,
  initialPrNumber = null,
  initialThreadId = null,
  mountId = null,
  onClose,
}: Props) => (
  <StudioShell
    icon={CONCEPT_ICONS.pr}
    title="Pull request"
    workspaceName={workspaceName}
    closeLabel="close pull request"
    onClose={onClose}
    variant="slot"
  >
    {(requestClose) => (
      <div className="min-h-0 flex-1">
        <PrDetailPanel
          sessionId={sessionId}
          initialPrNumber={initialPrNumber}
          initialThreadId={initialThreadId}
          mountId={mountId}
          onClose={requestClose}
        />
      </div>
    )}
  </StudioShell>
);
