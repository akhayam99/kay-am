import { Chip, Tooltip, cn } from '@goodboy/ui';
import type { SessionProjectMount } from '@goodboy/types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';

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
  const label = `${mounts.length} projects: ${names}`;
  return (
    <Tooltip content={label} side="top">
      <span className="inline-flex shrink-0">
        <Chip
          tone="neutral"
          size="xs"
          bordered={false}
          ariaLabel={label}
          icon={<CONCEPT_ICONS.mount size={ICON_SIZE.row} aria-hidden />}
          label={<span className="tabular-nums">{mounts.length}</span>}
        />
      </span>
    </Tooltip>
  );
};
