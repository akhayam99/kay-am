import type { MountId, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { gitlabMergeMr } from '../../../features/integrations/gitlab/client';
import { resolveMrContext, resolveSessionMrTarget } from './resolveMrContext';
import type { GetFn, SetFn } from './types';

export type MergeMrInput = {
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
};

export const mergeMrForSession = (_set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId }: MergeMrInput): Promise<void> => {
    const target = resolveSessionMrTarget({
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    if (target === null) {
      return;
    }
    const mr = get().mountGitlabMr?.[target.mount.id]?.mr ?? null;
    const context = await resolveMrContext({ get, sessionId, target });
    if (context === null || mr === null) {
      return;
    }
    try {
      await gitlabMergeMr(context.workspaceId, context.host, context.projectPath, mr.iid);
    } catch (err) {
      const errMsg = formatError(err);
      void get().emitNotification('error', 'error', `Merge of !${mr.iid} failed`, errMsg, {
        sessionId,
        workspaceId: context.workspaceId,
      });
      throw err;
    }
    await get().refreshSessionMr(sessionId, { force: true, mountId: target.mount.id });
  };
};
