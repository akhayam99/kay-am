import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import type { MountRowView } from '../../../../../store/slices/project-mounts/mountRowModel';
import { PullRequestChip } from '../../../../github/components/PullRequestChip';

type Props = {
  readonly sessionId: SessionId;
  readonly row: MountRowView;
  readonly label: string;
};

export const MountRequestLink = ({ sessionId, row, label }: Props) => {
  const openMountRequest = useAppStore((state) => state.openMountRequest);
  const request = row.request;

  if (request === null) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={`Open ${request.label} of ${label}`}
      onClick={() =>
        void openMountRequest({
          sessionId,
          mountId: row.mountId,
          provider: request.provider,
          requestNumber: request.number,
        })
      }
      className="flex min-w-0 shrink-0 items-center rounded-md px-1 py-1 hover:bg-muted/40"
    >
      <PullRequestChip
        state={request.isDraft ? 'draft' : request.state}
        variant="badge"
        number={request.number}
        iconSize={9}
      />
    </button>
  );
};
