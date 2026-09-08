import { updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime, SessionMountView } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  createWorktree,
  inspectWorktree,
  listBranchNames,
  sessionDirExists,
} from '../../../features/worktree/worktree';
import { mountDirName } from './mountDirName';
import { mountError } from './mountErrors';
import { withRepositoryAndMountLock } from './mountLocks';
import {
  beginMountOperation,
  failMountOperation,
  markMountOperationUncertain,
  succeedMountOperation,
} from './mountOperations';
import { applyMountViews, loadMountViews, requireMountView } from './mountViews';
import { requireMountContext } from './requireMountContext';
import { resolveSessionSlug, splitBranchName } from './resolveMountNaming';
import type { AttachMountInput, GetFn, SetFn } from './types';

type ReuseParams = {
  readonly view: SessionMountView;
  readonly path: string;
  readonly isRepo: boolean;
};

const canReusePath = async ({ view, path, isRepo }: ReuseParams): Promise<boolean> => {
  if (!isRepo) {
    return sessionDirExists({ path });
  }
  const inspection = await inspectWorktree({ repoPath: view.repoRoot, worktreePath: path });
  if (inspection.kind === 'repository-unavailable') {
    throw mountError({
      code: 'repository-unavailable',
      message: `repository unavailable: ${view.repoRoot}`,
      mountId: view.id,
    });
  }
  if (inspection.kind === 'foreign-directory') {
    throw mountError({
      code: 'directory-occupied',
      message: `directory is not a worktree of this repository: ${path}`,
      mountId: view.id,
    });
  }
  return inspection.kind === 'registered';
};

export const attachMount = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, mountId, requestId }: AttachMountInput): Promise<SessionMountView> => {
    const views = await loadMountViews({ get, sessionId });
    const view = requireMountView({ views, mountId });
    const { session, project } = requireMountContext({
      get,
      sessionId,
      projectId: view.projectId,
    });
    const isRepo = project.kind === 'repo';
    return withRepositoryAndMountLock({
      repoRoot: view.repoRoot,
      mountKey: `${sessionId}:${mountId}`,
      run: async () => {
        const operation = await beginMountOperation({
          sessionId,
          requestId: requestId ?? crypto.randomUUID(),
          kind: 'attach',
          mountId,
          expectedRevision: view.revision,
          input: { repoRoot: view.repoRoot, branch: view.branch },
        });
        const retained = view.worktreePath ?? view.lastWorktreePath;
        const reusable =
          retained !== null && (await canReusePath({ view, path: retained, isRepo }));
        const attachedPath = await (async (): Promise<string> => {
          if (reusable && retained !== null) {
            return retained;
          }
          if (!isRepo) {
            await failMountOperation({ operation, errorCode: 'unknown-state' });
            throw mountError({
              code: 'unknown-state',
              message: 'folder mounts cannot be recreated once their directory is gone',
              mountId,
            });
          }
          const branches = await listBranchNames({ repoPath: view.repoRoot }).catch(
            () => [] as ReadonlyArray<string>,
          );
          if (!branches.includes(view.branch)) {
            await failMountOperation({ operation, errorCode: 'branch-missing' });
            throw mountError({
              code: 'branch-missing',
              message: `branch no longer exists: ${view.branch}`,
              mountId,
            });
          }
          const prefixed = splitBranchName({ branch: view.branch });
          const sessionSlug = resolveSessionSlug({
            get,
            session,
            prefix: prefixed.branchPrefix,
          });
          try {
            const created = await createWorktree({
              repoPath: view.repoRoot,
              branchPrefix: prefixed.branchPrefix,
              slug: prefixed.branchSlug,
              parentDir: `${view.repoRoot}/.goodboy/worktrees`,
              dirName: mountDirName({ sessionSlug, mountId }),
              existingBranch: view.branch,
            });
            return created.worktreePath;
          } catch (error) {
            await failMountOperation({ operation, errorCode: 'unknown-state' });
            throw mountError({
              code: 'unknown-state',
              message: `could not recreate the worktree: ${formatError(error)}`,
              mountId,
            });
          }
        })();
        const written = await updateSessionMountLifecycle({
          db: tauriDatabase,
          sessionId,
          mountId,
          worktreePath: attachedPath,
          isAttached: true,
          diskState: 'present',
          expectedRevision: view.revision,
          updatedAt: new Date().toISOString() as IsoDateTime,
        }).catch(async (error: unknown) => {
          await markMountOperationUncertain({ operation, errorCode: 'directory-occupied' });
          throw mountError({
            code: 'directory-occupied',
            message: `directory already belongs to another mount: ${formatError(error)}`,
            mountId,
          });
        });
        if (!written) {
          await markMountOperationUncertain({ operation, errorCode: 'revision-conflict' });
          throw mountError({
            code: 'revision-conflict',
            message: 'the mount changed while attaching it',
            mountId,
          });
        }
        await succeedMountOperation({
          operation,
          result: {
            mountId,
            worktreePath: attachedPath,
            branch: view.branch,
            repoRoot: view.repoRoot,
          },
        });
        const nextViews = await loadMountViews({ get, sessionId });
        applyMountViews({ set, sessionId, views: nextViews });
        return requireMountView({ views: nextViews, mountId });
      },
    });
  };
};
