import type { WorkspaceId } from '@goodboy/types';
import { scanOrphanWorktrees, type OrphanWorktree } from '../../../features/worktree/worktree';
import { reconcileWorktreeOwnership } from '../mount-cleanup';
import type { GetFn, SetFn } from './types';

let inFlight: Promise<void> | null = null;
let queued = false;

const signature = (orphans: ReadonlyArray<OrphanWorktree>): string =>
  orphans
    .map((orphan) => orphan.path)
    .sort()
    .join('\n');

const runReconcile = async (set: SetFn, get: GetFn): Promise<void> => {
  const projects = get().projects.filter((project) => project.kind === 'repo');
  if (projects.length === 0) {
    return;
  }
  const { knownPaths } = await reconcileWorktreeOwnership({ set, get });
  const found: Array<[WorkspaceId, ReadonlyArray<OrphanWorktree>]> = [];
  for (const project of projects) {
    const orphans = await scanOrphanWorktrees({
      repoPath: project.rootPath,
      knownPaths,
    }).catch(() => []);
    const existingIndex = found.findIndex(([workspaceId]) => workspaceId === project.workspaceId);
    if (existingIndex < 0) {
      found.push([project.workspaceId, orphans]);
    }
    if (existingIndex >= 0) {
      const existing = found[existingIndex]!;
      found[existingIndex] = [existing[0], [...existing[1], ...orphans]];
    }
  }
  const previous = new Map<string, string>(
    found.map(([workspaceId]) => [
      workspaceId,
      signature(get().orphanWorktrees[workspaceId] ?? []),
    ]),
  );
  set((state) => {
    const next = { ...state.orphanWorktrees };
    for (const [workspaceId, orphans] of found) {
      next[workspaceId] = orphans;
    }
    return { orphanWorktrees: next };
  });
  for (const [workspaceId, orphans] of found) {
    if (orphans.length === 0 || previous.get(workspaceId) === signature(orphans)) {
      continue;
    }
    await get().emitNotification(
      'orphan-worktrees',
      'info',
      `${orphans.length} session folders left on disk`,
      'They belong to no session any more. Review them in workspace settings and remove them when you want the space back.',
      { workspaceId, action: { kind: 'open-orphan-worktrees', workspaceId } },
    );
  }
};

export const reconcileOrphanWorktrees = (set: SetFn, get: GetFn) => {
  return async (): Promise<void> => {
    if (inFlight !== null) {
      queued = true;
      await inFlight;
      return;
    }
    const run = runReconcile(set, get).finally(() => {
      inFlight = null;
    });
    inFlight = run;
    await run;
    if (queued) {
      queued = false;
      await reconcileOrphanWorktrees(set, get)();
    }
  };
};
