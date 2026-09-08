import type { MountId, MountPullRequestProvider, SessionId } from '@goodboy/types';
import type { SessionStudio } from '../session-view/types';
import type { GetFn, SetFn } from './types';

export type OpenMountRequestInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly provider: MountPullRequestProvider;
  readonly requestNumber?: number;
  readonly threadId?: string;
};

type StudioParams = {
  readonly mountId: MountId;
  readonly provider: MountPullRequestProvider;
  readonly requestNumber: number | undefined;
  readonly threadId: string | undefined;
};

const studioFor = ({ mountId, provider, requestNumber, threadId }: StudioParams): SessionStudio => {
  if (provider === 'gitlab') {
    return { kind: 'mr', mountId };
  }
  if (provider === 'bitbucket') {
    return { kind: 'bitbucket', mountId };
  }
  return {
    kind: 'github',
    mountId,
    ...(requestNumber === undefined ? {} : { prNumber: requestNumber }),
    ...(threadId === undefined ? {} : { threadId }),
  };
};

export const openMountRequest = (_set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    provider,
    requestNumber,
    threadId,
  }: OpenMountRequestInput): Promise<void> => {
    await get()
      .setSessionActiveMount({ sessionId, mountId })
      .catch(() => undefined);
    get().setSessionStudio(sessionId, studioFor({ mountId, provider, requestNumber, threadId }));
  };
};
