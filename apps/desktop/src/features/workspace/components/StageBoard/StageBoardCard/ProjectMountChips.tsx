import { Chip, Tooltip, cn } from '@goodboy/ui';
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
        <span className={cn('inline-flex min-w-0', IDENTITY_SLOT)}>
          <Chip
            tone="neutral"
            size="xs"
            bordered={false}
            label={<span className="min-w-0 truncate">{first.mountName}</span>}
            className="w-full"
          />
        </span>
      </Tooltip>
    );
  }
  const names = mounts.map((mount) => mount.mountName).join(', ');
  return (
    <Tooltip content={names} side="top">
      <span className="inline-flex shrink-0">
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
        />
      </span>
    </Tooltip>
  );
};
