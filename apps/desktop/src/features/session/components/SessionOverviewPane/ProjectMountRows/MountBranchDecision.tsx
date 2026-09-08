import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { InlineConfirm, formatError } from '@goodboy/ui';
import type { MountBranchObservation, MountId, SessionId } from '@goodboy/types';
import { useToast } from '../../../../../app/components/Toast';
import { useAppStore } from '../../../../../store';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly observation: MountBranchObservation;
};

type DescriptionParams = {
  readonly observation: MountBranchObservation;
};

const describe = ({ observation }: DescriptionParams): string => {
  if (observation.state === 'unavailable') {
    return `Recorded on ${observation.recordedBranch}, but its directory is gone.`;
  }
  if (observation.state === 'detached') {
    return `Recorded on ${observation.recordedBranch}, but the worktree sits on a detached HEAD.`;
  }
  return `Recorded on ${observation.recordedBranch}, found on ${observation.observedBranch ?? 'an unknown branch'}.`;
};

export const MountBranchDecision = ({ sessionId, mountId, observation }: Props) => {
  const resolveMountBranchMismatch = useAppStore((state) => state.resolveMountBranchMismatch);
  const { showToast } = useToast();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  if (isDismissed) {
    return null;
  }

  const resolve = async (resolution: 'adopt-observed' | 'keep-both') => {
    setIsBusy(true);
    try {
      await resolveMountBranchMismatch({ sessionId, mountId, resolution });
      setIsDismissed(true);
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <InlineConfirm
      role="alert"
      icon={<GitBranch size={ICON_SIZE.row} aria-hidden />}
      title="This branch mount is not where it was left"
      description={describe({ observation })}
      confirmLabel="Use this branch here"
      cancelLabel="Decide later"
      isBusy={isBusy}
      isConfirmDisabled={observation.state !== 'mismatch'}
      altAction={{
        label: 'Keep both branches',
        disabled: observation.state !== 'mismatch',
        onClick: () => void resolve('keep-both'),
      }}
      onConfirm={() => resolve('adopt-observed')}
      onCancel={() => setIsDismissed(true)}
    />
  );
};
