import { cn } from '@goodboy/ui';
import type { MountPullRequestProvider, SessionId } from '@goodboy/types';
import type { RemoteHostKind } from '../../../../../shared/lib/remoteHost';
import { useAppStore } from '../../../../../store';
import type { MountRowView } from '../../../../../store/slices/project-mounts/mountRowModel';
import { usePrDraftAgentRunning } from '../../../../github/usePrDraftAgentRunning';

type Props = {
  readonly sessionId: SessionId;
  readonly row: MountRowView;
  readonly label: string;
  readonly hasChanges: boolean;
  readonly remoteKind: RemoteHostKind | null;
};

const CREATABLE: Readonly<Record<string, MountPullRequestProvider>> = {
  github: 'github',
  gitlab: 'gitlab',
};

export const MountRequestAction = ({ sessionId, row, label, hasChanges, remoteKind }: Props) => {
  const openMountRequest = useAppStore((state) => state.openMountRequest);
  const isDraftAgentRunning = usePrDraftAgentRunning({ sessionId });
  const request = row.request;

  if (request !== null) {
    return null;
  }

  const provider = remoteKind === null ? undefined : CREATABLE[remoteKind];
  if (provider === undefined || !hasChanges || !row.isAttached) {
    return null;
  }

  const isBlocked = provider === 'github' && isDraftAgentRunning;
  const idleLabel = provider === 'gitlab' ? 'Create MR' : 'Create PR';

  return (
    <button
      type="button"
      disabled={isBlocked}
      aria-label={isBlocked ? `An agent is opening a PR for ${label}` : `Create a PR for ${label}`}
      onClick={() => void openMountRequest({ sessionId, mountId: row.mountId, provider })}
      className={cn(
        'shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
      )}
    >
      {isBlocked ? 'Opening PR…' : idleLabel}
    </button>
  );
};
