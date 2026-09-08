import { listMountOperations } from '@goodboy/db';
import type { MountOperation } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { inspectWorktree } from '../../../features/worktree/worktree';
import {
  failMountOperation,
  markMountOperationUncertain,
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
    const views = await loadMountViews({ get, sessionId });
    let settled = 0;
    for (const operation of unsettled) {
      const recorded = views.find((candidate) => candidate.id === operation.mountId);
      if (recorded !== undefined) {
        await succeedMountOperation({ operation });
        settled += 1;
        continue;
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
