import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import type { MountRowView } from '../../../../../store/slices/project-mounts/mountRowModel';

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
      className="flex shrink-0 items-center rounded-md px-1.5 py-1 font-mono text-xs tabular-nums text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      {`#${request.number}`}
    </button>
  );
};
