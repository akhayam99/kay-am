import { Chip, Tooltip } from '@goodboy/ui';
import type { SessionProjectMount } from '@goodboy/types';

const IDENTITY_SLOT = 'w-24 shrink-0';

type Props = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
};

export const ProjectMountChips = ({ mounts }: Props) => {
  const [first] = mounts;
  if (first === undefined) {
    return null;
  }
  if (mounts.length === 1) {
    return (
      <Tooltip content={first.mountName} side="top">
        <Chip
          tone="neutral"
          size="xs"
          bordered={false}
          label={<span className="min-w-0 truncate">{first.mountName}</span>}
          className={IDENTITY_SLOT}
        />
      </Tooltip>
    );
  }
  const names = mounts.map((mount) => mount.mountName).join(', ');
  return (
    <Tooltip content={names} side="top">
      <Chip
        tone="neutral"
        size="xs"
        bordered={false}
        ariaLabel={`${mounts.length} projects: ${names}`}
        label={
          <span className="min-w-0 truncate">
            <span className="tabular-nums">{mounts.length}</span> projects
          </span>
        }
        className="shrink-0"
      />
    </Tooltip>
  );
};
