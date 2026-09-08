import type { MountId, MountRecoveryCode } from '@goodboy/types';

export type MountError = Error & {
  readonly code: MountRecoveryCode;
  readonly mountId: MountId | null;
  readonly recoverable: true;
};

type Params = {
  readonly code: MountRecoveryCode;
  readonly message: string;
  readonly mountId?: MountId;
};

export const mountError = ({ code, message, mountId }: Params): MountError =>
  Object.assign(new Error(message), {
    code,
    mountId: mountId ?? null,
    recoverable: true as const,
  });
