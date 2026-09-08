import type { MountId, ProjectId, SessionProjectMount } from '@goodboy/types';

type Params = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly selectedMountId: MountId | null | undefined;
  readonly storedMountId: MountId | null | undefined;
  readonly activeProjectId: ProjectId | null | undefined;
};

export const pickActiveMount = ({
  mounts,
  selectedMountId,
  storedMountId,
  activeProjectId,
}: Params): SessionProjectMount | null => {
  const owned = (candidate: MountId | null | undefined): SessionProjectMount | undefined =>
    candidate == null ? undefined : mounts.find((mount) => mount.mountId === candidate);
  return (
    owned(selectedMountId) ??
    owned(storedMountId) ??
    mounts.find((mount) => mount.projectId === activeProjectId) ??
    mounts[0] ??
    null
  );
};
