import { insertSessionMount } from '@goodboy/db';
import type { IsoDateTime, MountId, SessionMountView } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { tauriDatabase } from '../../../shared/lib/db';
import { createWorktree, listBranchNames } from '../../../features/worktree/worktree';
import { nextAvailableSlug } from '../sessions/deriveBranchName';
import { mountDirName } from './mountDirName';
import { mountError } from './mountErrors';
import { withRepositoryAndMountLock } from './mountLocks';
import {
  beginMountOperation,
  failMountOperation,
  markMountOperationUncertain,
  reusableMountOperationResult,
  succeedMountOperation,
} from './mountOperations';
import { applyMountViews, loadMountViews, requireMountView } from './mountViews';
import { requireMountContext } from './requireMountContext';
import {
  resolveMountBranchPrefix,
  resolveSessionSlug,
  splitBranchName,
} from './resolveMountNaming';
import type { ForkMountInput, GetFn, SetFn } from './types';

export const forkMount = (set: SetFn, get: GetFn) => {
  return async (input: ForkMountInput): Promise<SessionMountView> => {
    const { sessionId, projectId } = input;
    const { session, project } = requireMountContext({ get, sessionId, projectId });
    if (project.kind !== 'repo') {
      throw mountError({
        code: 'unknown-state',
        message: 'only repository projects can hold more than one mount',
      });
    }
    const generatedMountId = crypto.randomUUID() as MountId;
    const requestId = input.requestId ?? generatedMountId;
    return withRepositoryAndMountLock({
      repoRoot: project.rootPath,
      mountKey: `${sessionId}:${requestId}`,
      run: async () => {
        const views = await loadMountViews({ get, sessionId });
        const operation = await beginMountOperation({
          sessionId,
          requestId,
          kind: 'fork',
          mountId: generatedMountId,
          expectedRevision: 0,
          input: { projectId, repoRoot: project.rootPath },
        });
        const reused = reusableMountOperationResult({
          operation,
          expected: { repoRoot: project.rootPath },
        });
        if (reused !== null) {
          const existing = views.find((candidate) => candidate.id === reused.mountId);
          if (existing !== undefined) {
            applyMountViews({ set, sessionId, views });
            return existing;
          }
        }
        const mountId = (operation.mountId ?? generatedMountId) as MountId;
        const prefix = resolveMountBranchPrefix({ get, session, project });
        const sessionSlug = resolveSessionSlug({ get, session, prefix });
        const remoteBranches = await listBranchNames({ repoPath: project.rootPath }).catch(
          () => [] as ReadonlyArray<string>,
        );
        const taken = [...remoteBranches, ...views.map((candidate) => candidate.branch)];
        const requested = input.branch?.trim() ?? '';
        const split = splitBranchName({ branch: requested });
        const branchPrefix = split.branchPrefix === '' ? prefix : split.branchPrefix;
        const branchSlug =
          requested === ''
            ? nextAvailableSlug({ base: sessionSlug, prefix, taken })
            : split.branchSlug;
        const adopt = input.adoptExistingBranch === true;
        if (!adopt && requested !== '' && taken.includes(`${branchPrefix}/${branchSlug}`)) {
          await failMountOperation({ operation, errorCode: 'branch-taken' });
          throw mountError({
            code: 'branch-taken',
            message: `branch already exists: ${branchPrefix}/${branchSlug}`,
          });
        }
        const baseBranch = input.baseBranch ?? project.baseBranch ?? undefined;
        let created;
        try {
          created = await createWorktree({
            repoPath: project.rootPath,
            branchPrefix,
            slug: branchSlug,
            parentDir: `${project.rootPath}/.goodboy/worktrees`,
            dirName: mountDirName({ sessionSlug, mountId }),
            ...(adopt ? { existingBranch: `${branchPrefix}/${branchSlug}` } : {}),
            ...(baseBranch !== undefined ? { baseBranch } : {}),
          });
        } catch (error) {
          await failMountOperation({ operation, errorCode: 'unknown-state' });
          await get().recordSessionEvent({
            sessionId,
            kind: 'project_materialization_refused',
            payload: { projectId, projectName: project.name, reason: formatError(error) },
          });
          throw error;
        }
        const result = {
          mountId,
          worktreePath: created.worktreePath,
          branch: created.branchName,
          repoRoot: project.rootPath,
        };
        if (!views.some((candidate) => candidate.id === mountId)) {
          const timestamp = new Date().toISOString() as IsoDateTime;
          const parallelIndex =
            views.reduce((max, candidate) => Math.max(max, candidate.parallelIndex), 0) + 1;
          try {
            await insertSessionMount({
              db: tauriDatabase,
              mount: {
                id: mountId,
                sessionId,
                projectId,
                worktreePath: created.worktreePath,
                lastWorktreePath: created.worktreePath,
                branch: created.branchName,
                baseBranch: baseBranch ?? null,
                parallelIndex,
                mountName: input.mountName ?? project.name,
                repoSlug: null,
                isAttached: true,
                diskState: 'present',
                revision: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            });
          } catch (error) {
            await markMountOperationUncertain({
              operation,
              result,
              errorCode: 'directory-occupied',
            });
            throw mountError({
              code: 'directory-occupied',
              message: `worktree created but not recorded: ${formatError(error)}`,
              mountId,
            });
          }
        }
        await succeedMountOperation({ operation, result });
        await get().recordSessionEvent({
          sessionId,
          kind: 'worktree_created',
          payload: {
            projectId,
            projectName: project.name,
            branch: created.branchName,
            worktreePath: created.worktreePath,
          },
        });
        const nextViews = await loadMountViews({ get, sessionId });
        applyMountViews({ set, sessionId, views: nextViews });
        return requireMountView({ views: nextViews, mountId });
      },
    });
  };
};
