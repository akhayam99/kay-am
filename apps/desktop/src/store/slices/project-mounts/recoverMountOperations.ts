import { insertSessionMount, listMountOperations, updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime, MountId, MountOperation, ProjectId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { inspectWorktree } from '../../../features/worktree/worktree';
import {
  failMountOperation,
  markMountOperationUncertain,
  plannedMountId,
  succeedMountOperation,
} from './mountOperations';
import { applyMountViews, loadMountViews } from './mountViews';
import type { GetFn, SessionKeyInput, SetFn } from './types';

const readPath = ({ operation }: { readonly operation: MountOperation }): string | null => {
  const sources = [operation.result, operation.input];
  const found = sources.find((source) => {
    if (source === null || typeof source !== 'object') {
      return false;
    }
    return typeof (source as { worktreePath?: unknown }).worktreePath === 'string';
  });
  if (found === undefined) {
    return null;
  }
  return (found as { readonly worktreePath: string }).worktreePath;
};

const readRepoRoot = ({ operation }: { readonly operation: MountOperation }): string | null => {
  const sources = [operation.result, operation.input];
  const found = sources.find((source) => {
    if (source === null || typeof source !== 'object') {
      return false;
    }
    return typeof (source as { repoRoot?: unknown }).repoRoot === 'string';
  });
  if (found === undefined) {
    return null;
  }
  return (found as { readonly repoRoot: string }).repoRoot;
};

const readString = ({ source, key }: { readonly source: unknown; readonly key: string }) => {
  if (source === null || typeof source !== 'object') {
    return null;
  }
  const value = (source as Readonly<Record<string, unknown>>)[key];
  return typeof value === 'string' ? value : null;
};

type RecoverForkParams = {
  readonly get: GetFn;
  readonly operation: MountOperation;
  readonly views: Awaited<ReturnType<typeof loadMountViews>>;
};

const recoverFork = async ({ get, operation, views }: RecoverForkParams): Promise<boolean> => {
  const mountId =
    operation.mountId ??
    (readString({ source: operation.result, key: 'mountId' }) as MountId | null) ??
    plannedMountId({ operation });
  const worktreePath = readPath({ operation });
  const repoRoot = readRepoRoot({ operation });
  const branch = readString({ source: operation.result, key: 'branch' });
  const projectId = readString({ source: operation.input, key: 'projectId' });
  if (
    mountId === null ||
    worktreePath === null ||
    repoRoot === null ||
    branch === null ||
    projectId === null
  ) {
    return false;
  }
  const inspection = await inspectWorktree({ repoPath: repoRoot, worktreePath }).catch(() => null);
  if (inspection?.kind !== 'registered' || inspection.isMain) {
    return false;
  }
  const project = get().projects.find((candidate) => candidate.id === projectId);
  if (project === undefined || project.rootPath !== repoRoot) {
    return false;
  }
  const baseBranch = readString({ source: operation.input, key: 'baseBranch' });
  const mountName = readString({ source: operation.input, key: 'mountName' });
  const timestamp = new Date().toISOString() as IsoDateTime;
  await insertSessionMount({
    db: tauriDatabase,
    mount: {
      id: mountId,
      sessionId: operation.sessionId,
      projectId: projectId as ProjectId,
      worktreePath,
      lastWorktreePath: worktreePath,
      branch,
      baseBranch: baseBranch ?? project.baseBranch ?? null,
      parallelIndex: views.reduce((highest, view) => Math.max(highest, view.parallelIndex), 0) + 1,
      mountName: mountName ?? project.name,
      repoSlug: null,
      isAttached: true,
      diskState: 'present',
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  await succeedMountOperation({
    operation,
    result: { mountId, worktreePath, branch, repoRoot },
  });
  return true;
};

type RecoverUnmountParams = {
  readonly operation: MountOperation;
  readonly mountId: MountId;
  readonly revision: number;
};

const recoverUnmount = async ({
  operation,
  mountId,
  revision,
}: RecoverUnmountParams): Promise<boolean> => {
  const worktreePath = readPath({ operation });
  const repoRoot = readRepoRoot({ operation });
  if (worktreePath === null || repoRoot === null) {
    return false;
  }
  const inspection = await inspectWorktree({ repoPath: repoRoot, worktreePath }).catch(() => null);
  if (inspection?.kind !== 'missing') {
    return false;
  }
  const timestamp = new Date().toISOString() as IsoDateTime;
  const written = await updateSessionMountLifecycle({
    db: tauriDatabase,
    sessionId: operation.sessionId,
    mountId,
    worktreePath: null,
    isAttached: false,
    diskState: 'removed',
    expectedRevision: revision,
    updatedAt: timestamp,
  });
  if (!written) {
    return false;
  }
  await succeedMountOperation({ operation });
  return true;
};

export const recoverMountOperations = (set: SetFn, get: GetFn) => {
  return async ({ sessionId }: SessionKeyInput): Promise<number> => {
    const operations = await listMountOperations({ db: tauriDatabase, sessionId });
    const unsettled = operations.filter(
      (operation) =>
        operation.status === 'pending' ||
        operation.status === 'running' ||
        operation.status === 'uncertain',
    );
    if (unsettled.length === 0) {
      return 0;
    }
    let views = await loadMountViews({ get, sessionId });
    let settled = 0;
    for (const operation of unsettled) {
      if (operation.kind === 'remove' && operation.status === 'pending') {
        continue;
      }
      const recorded = views.find((candidate) => candidate.id === operation.mountId);
      if (recorded !== undefined) {
        if (operation.kind === 'unmount') {
          if (recorded.worktreePath === null && !recorded.isAttached) {
            await succeedMountOperation({ operation });
            settled += 1;
            continue;
          }
          const recovered = await recoverUnmount({
            operation,
            mountId: recorded.id,
            revision: recorded.revision,
          });
          if (recovered) {
            views = await loadMountViews({ get, sessionId });
            settled += 1;
          } else {
            await markMountOperationUncertain({ operation, errorCode: 'unknown-state' });
          }
          continue;
        }
        await succeedMountOperation({ operation });
        settled += 1;
        continue;
      }
      if (operation.kind === 'fork') {
        const recovered = await recoverFork({ get, operation, views }).catch(() => false);
        if (recovered) {
          views = await loadMountViews({ get, sessionId });
          settled += 1;
          continue;
        }
      }
      const worktreePath = readPath({ operation });
      const repoRoot = readRepoRoot({ operation });
      if (worktreePath === null || repoRoot === null) {
        await failMountOperation({ operation, errorCode: 'unknown-state' });
        settled += 1;
        continue;
      }
      const inspection = await inspectWorktree({ repoPath: repoRoot, worktreePath }).catch(
        () => null,
      );
      if (inspection === null || inspection.kind === 'repository-unavailable') {
        await markMountOperationUncertain({ operation, errorCode: 'repository-unavailable' });
        continue;
      }
      if (inspection.kind === 'missing') {
        await failMountOperation({ operation, errorCode: 'unknown-state' });
        settled += 1;
        continue;
      }
      await markMountOperationUncertain({ operation, errorCode: 'directory-occupied' });
    }
    applyMountViews({ set, sessionId, views });
    return settled;
  };
};
