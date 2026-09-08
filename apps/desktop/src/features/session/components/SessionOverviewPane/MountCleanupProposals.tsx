import { useEffect, useState } from 'react';
import type { MountCleanupProposal, SessionId } from '@goodboy/types';
import { Button, formatError } from '@goodboy/ui';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { formatDiskSize } from '../../../worktree/utils/formatDiskSize';

type Props = {
  readonly sessionId: SessionId;
};

const reasonLabel = (proposal: MountCleanupProposal): string => {
  if (proposal.request !== null) {
    return `request #${proposal.request.prNumber} merged`;
  }
  return proposal.reason === 'archive' ? 'session archived' : 'cleanup pending';
};

export const MountCleanupProposals = ({ sessionId }: Props) => {
  const proposals = useAppStore(
    (state) =>
      state.mountCleanupProposals[sessionId] ??
      (EMPTY_ARRAY as ReadonlyArray<MountCleanupProposal>),
  );
  const loadMountCleanupProposals = useAppStore((state) => state.loadMountCleanupProposals);
  const resolveMountCleanup = useAppStore((state) => state.resolveMountCleanup);
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadMountCleanupProposals({ sessionId }).catch(() => undefined);
  }, [sessionId]);

  if (proposals.length === 0) {
    return null;
  }

  const resolve = async (proposal: MountCleanupProposal, decision: 'remove' | 'keep') => {
    setBusy(proposal.requestId);
    try {
      await resolveMountCleanup({ sessionId, requestId: proposal.requestId, decision });
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-border-soft px-3 py-2">
      {proposals.map((proposal) => (
        <div key={proposal.requestId} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs text-foreground">
              {proposal.branch} ({reasonLabel(proposal)})
            </span>
            <span className="truncate text-2xs text-muted-foreground">
              {proposal.worktreePath}
              {proposal.sizeBytes === null
                ? ''
                : ` (${formatDiskSize({ bytes: proposal.sizeBytes })})`}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void resolve(proposal, 'remove')}
              className="text-danger hover:bg-danger/10 hover:text-danger"
            >
              Remove worktree
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void resolve(proposal, 'keep')}
            >
              Keep
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
