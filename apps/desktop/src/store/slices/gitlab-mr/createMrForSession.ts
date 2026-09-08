import { findPrSeriesMembership, upsertMountPullRequestLink } from '@goodboy/db';
import type { IsoDateTime, MountId, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { gitlabCreateMr } from '../../../features/integrations/gitlab/client';
import { appendClosingReferences } from '../../../features/github/appendClosingReferences';
import { partOfReferences } from '../../../features/github/partOfReferences';
import { seriesReferenceLines } from '../pr-series/seriesReferences';
import { tauriDatabase } from '../../../shared/lib/db';
import { mountRequestEventPayload } from '../project-mounts/mountRequests';
import { gitlabRequestIdentity, toMountMrLink } from './mrLink';
import { resolveMrContext, resolveSessionMrTarget } from './resolveMrContext';
import type { GetFn, SetFn } from './types';

export type CreateMrReferenceMode = 'closing' | 'part-of' | 'none';

export type CreateMrInput = {
  readonly sessionId: SessionId;
  readonly mountId?: MountId;
  readonly title?: string;
  readonly description?: string;
  readonly targetBranch?: string;
  readonly draft?: boolean;
  readonly referenceMode?: CreateMrReferenceMode;
};

export const createMrForSession = (_set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    title,
    description,
    targetBranch,
    draft,
    referenceMode,
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
    const membership = await findPrSeriesMembership({
      db: tauriDatabase,
      sessionId,
      mountId: mount.id,
      branch: mount.branch,
    });
    const mode = referenceMode ?? (membership === null ? 'closing' : 'part-of');
    const filledDescription = description ?? '';
    const seriesLines =
      membership === null || mode !== 'part-of'
        ? []
        : seriesReferenceLines({
            series: membership.series,
            member: membership.member,
            body: filledDescription,
          });
    const taskLines =
      mode === 'part-of'
        ? partOfReferences({
            tasks: get().sessionExternalTasks[sessionId] ?? [],
            branch: mount.branch,
            body: filledDescription,
          }).filter((line) => !seriesLines.includes(line))
        : [];
    const resolvedDescription = appendClosingReferences({
      body: filledDescription,
      references: [],
      lines: [...taskLines, ...seriesLines],
    });
    let created;
    try {
      created = await gitlabCreateMr({
        workspaceId: context.workspaceId,
        host: context.host,
        projectPath: context.projectPath,
        sourceBranch: mount.branch,
        targetBranch: base,
        title: resolvedTitle,
        description: resolvedDescription,
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
