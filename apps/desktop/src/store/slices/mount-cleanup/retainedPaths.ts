import {
  deleteRetainedWorktreePath,
  listAllRetainedWorktreePaths,
  listMountPathOwnership,
  listUnsettledMountOperations,
  markRetainedWorktreePathChecked,
  purgeSessionMounts,
  type MountPathOwnership,
} from '@goodboy/db';
import type { IsoDateTime, RetainedWorktreePath, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { worktreeDirectorySize } from '../../../features/worktree/worktree';
import type { GetFn, SetFn } from './types';

export type WorktreeOwnership = {
  readonly knownPaths: ReadonlyArray<string>;
  readonly retained: ReadonlyArray<RetainedWorktreePath>;
};

type ReconcileParams = {
  readonly set: SetFn;
  readonly get: GetFn;
};

type ProbeOutcome = 'present' | 'missing' | 'unknown';

const probePath = async (path: string): Promise<ProbeOutcome> => {
  try {
    const size = await worktreeDirectorySize({ path });
    if (!size.exists) {
      return 'missing';
    }
    return size.sizeBytes === null ? 'unknown' : 'present';
  } catch {
    return 'unknown';
  }
};

type RetainParams = {
  readonly row: MountPathOwnership;
  readonly repoRoot: string;
  readonly now: IsoDateTime;
};

const toRetained = ({ row, repoRoot, now }: RetainParams): RetainedWorktreePath => ({
  id: crypto.randomUUID(),
  workspaceId: row.workspaceId,
  projectId: row.projectId,
  sourceSessionId: row.sessionId,
  sourceMountId: row.mountId,
  repoRoot,
  worktreePath: row.worktreePath,
  branch: row.branch,
  reason: 'session_delete',
  lastCheckedAt: now,
  createdAt: now,
  updatedAt: now,
});

const operationPaths = (inputs: ReadonlyArray<unknown>): ReadonlyArray<string> =>
  inputs.flatMap((input) => {
    if (input === null || typeof input !== 'object') {
      return [];
    }
    const path = (input as { readonly worktreePath?: unknown }).worktreePath;
    return typeof path === 'string' ? [path] : [];
  });

export const reconcileWorktreeOwnership = async ({
  set,
  get,
}: ReconcileParams): Promise<WorktreeOwnership> => {
  const [ownership, retained, operations] = await Promise.all([
    listMountPathOwnership(tauriDatabase),
    listAllRetainedWorktreePaths({ db: tauriDatabase }),
    listUnsettledMountOperations({ db: tauriDatabase }),
  ]);
  const projects = get().projects;
  const now = new Date().toISOString() as IsoDateTime;
  const stale = new Map<SessionId, Array<MountPathOwnership>>();
  for (const row of ownership) {
    if (!row.isSessionDeleted) {
      continue;
    }
    stale.set(row.sessionId, [...(stale.get(row.sessionId) ?? []), row]);
  }
  const adopted: Array<RetainedWorktreePath> = [];
  for (const [sessionId, rows] of stale) {
    const transfers: Array<RetainedWorktreePath> = [];
    for (const row of rows) {
      const outcome = await probePath(row.worktreePath);
      if (outcome === 'missing') {
        continue;
      }
      const project = projects.find((candidate) => candidate.id === row.projectId);
      transfers.push(toRetained({ row, repoRoot: project?.rootPath ?? '', now }));
    }
    try {
      await purgeSessionMounts({ db: tauriDatabase, sessionId, retained: transfers });
      adopted.push(...transfers);
    } catch {
      continue;
    }
  }
  const surviving: Array<RetainedWorktreePath> = [];
  for (const path of retained) {
    const outcome = await probePath(path.worktreePath);
    if (outcome === 'missing') {
      await deleteRetainedWorktreePath({ db: tauriDatabase, id: path.id }).catch(() => undefined);
      continue;
    }
    await markRetainedWorktreePathChecked({
      db: tauriDatabase,
      id: path.id,
      lastCheckedAt: now,
    }).catch(() => undefined);
    surviving.push({ ...path, lastCheckedAt: now });
  }
  const all = [...surviving, ...adopted];
  const byWorkspace: Record<string, Array<RetainedWorktreePath>> = {};
  for (const path of all) {
    byWorkspace[path.workspaceId] = [...(byWorkspace[path.workspaceId] ?? []), path];
  }
  set({ retainedWorktreePaths: byWorkspace });
  const live = ownership.filter((row) => !row.isSessionDeleted).map((row) => row.worktreePath);
  const knownPaths = [
    ...new Set([
      ...live,
      ...all.map((path) => path.worktreePath),
      ...operationPaths(operations.map((operation) => operation.input)),
    ]),
  ];
  return { knownPaths, retained: all };
};
