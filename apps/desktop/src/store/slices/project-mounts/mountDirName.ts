import type { MountId } from '@goodboy/types';

const MAX_DIR_NAME_LENGTH = 48;

type Params = {
  readonly sessionSlug: string;
  readonly mountId: MountId;
};

export const mountDirName = ({ sessionSlug, mountId }: Params): string => {
  const budget = MAX_DIR_NAME_LENGTH - mountId.length - 1;
  if (budget <= 0) {
    return mountId;
  }
  const head = sessionSlug.slice(0, budget).replace(/-+$/g, '');
  if (head === '') {
    return mountId;
  }
  return `${head}-${mountId}`;
};
