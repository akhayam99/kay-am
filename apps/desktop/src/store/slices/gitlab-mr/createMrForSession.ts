import { upsertMountPullRequestLink } from '@goodboy/db';
import type { IsoDateTime, MountId, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { gitlabCreateMr } from '../../../features/integrations/gitlab/client';
import { tauriDatabase } from '../../../shared/lib/db';
import { mountRequestEventPayload } from '../project-mounts/mountRequests';
import { gitlabRequestIdentity, toMountMrLink } from './mrLink';
import { resolveMrContext, resolveSessionMrTarget } from './resolveMrContext';
import type { GetFn, SetFn } from './types';

export type CreateMrInput = {
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
  readonly title?: string;
  readonly description?: string;
  readonly targetBranch?: string;
  readonly draft?: boolean;
};

export const createMrForSession = (_set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    title,
    description,
    targetBranch,
    draft,
  }: CreateMrInput): Promise<void> => {
    const target = resolveSessionMrTarget({
      get,
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    const context = target === null ? null : await resolveMrContext({ get, sessionId, target });
    if (target === null || context === null) {
      throw new Error(
        'No GitLab project is linked to this session yet, open it once so its worktree resolves.',
      );
    }
    const mount = target.mount;
    const projectBaseBranch = get().projects.find(
      (project) => project.id === mount.projectId,
    )?.baseBranch;
    const base = targetBranch?.trim() || mount.baseBranch || projectBaseBranch || 'main';
    const resolvedTitle = title?.trim() || context.goal;
    const isDraft = draft ?? true;
    let created;
    try {
      created = await gitlabCreateMr({
        workspaceId: context.workspaceId,
        host: context.host,
        projectPath: context.projectPath,
        sourceBranch: mount.branch,
        targetBranch: base,
        title: resolvedTitle,
        description: description ?? '',
        draft: isDraft,
      });
    } catch (err) {
      const errMsg = formatError(err);
      void get().emitNotification('error', 'error', 'MR creation failed', errMsg, {
        sessionId,
        workspaceId: context.workspaceId,
      });
      throw err;
    }
    const observedAt = new Date().toISOString() as IsoDateTime;
    const link = toMountMrLink({
      mountId: mount.id,
      host: context.host,
      projectPath: context.projectPath,
      mr: created,
      existing: null,
      observedAt,
    });
    await upsertMountPullRequestLink({ db: tauriDatabase, sessionId, link });
    await get().recordSessionEventOnce({
      sessionId,
      kind: 'pr_created',
      payload: mountRequestEventPayload({
        mountId: mount.id,
        projectId: mount.projectId,
        identity: gitlabRequestIdentity({
          host: context.host,
          projectPath: context.projectPath,
          mr: created,
        }),
        title: resolvedTitle,
        url: created.webUrl,
        branch: mount.branch,
      }),
    });
    await get().refreshSessionMr(sessionId, { force: true, mountId: mount.id });
    void get().emitNotification(
      'pr-created',
      'success',
      `MR created for: ${context.goal}`,
      undefined,
      { sessionId, workspaceId: context.workspaceId },
    );
  };
};
