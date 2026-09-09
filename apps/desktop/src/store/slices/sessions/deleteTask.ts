import type {
  IsoDateTime,
  MountDiskState,
  Project,
  ProviderRunId,
  RetainedWorktreePath,
  SessionId,
  SessionMount,
  WorkspaceId,
} from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import {
  detachSessionMounts,
  listSessionMounts,
  purgeSessionForDelete,
  type MountDetachment,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { cancelTurn, listLiveRunIds } from '../../../features/chat/turn';
import {
  removeSessionDirectory,
  scratchDirRemove,
  tidyRepoGoodboyDir,
} from '../../../features/worktree/worktree';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { purgeSessionFileVersions } from '../file-versions/persistFinalizedFileVersions';
import { dropPendingTurnEvents } from '../transcripts/buffer';
import { cleanupMountDirectory } from '../mount-cleanup';
import { forgetMaterializationSeed } from './materializationSeeds';
import type { GetFn, SetFn } from './types';

const RUN_STOP_ATTEMPTS = 20;
const RUN_STOP_INTERVAL_MS = 100;

const removePersistedDirectory = async (path: string): Promise<void> => {
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (parent === '') {
    throw new Error(`session path has no parent: ${path}`);
  }
  await removeSessionDirectory({ basePath: parent, path });
};

const awaitRunStopped = async (runId: ProviderRunId): Promise<boolean> => {
  for (let attempt = 0; attempt < RUN_STOP_ATTEMPTS; attempt += 1) {
    const live = await listLiveRunIds();
    if (!live.has(runId)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, RUN_STOP_INTERVAL_MS));
  }
  const live = await listLiveRunIds();
  return !live.has(runId);
};

type RetainParams = {
  readonly mount: SessionMount;
  readonly worktreePath: string;
  readonly repoRoot: string;
  readonly workspaceId: WorkspaceId;
  readonly now: IsoDateTime;
};

const toRetained = ({
  mount,
  worktreePath,
  repoRoot,
  workspaceId,
  now,
}: RetainParams): RetainedWorktreePath => ({
  id: crypto.randomUUID(),
  workspaceId,
  projectId: mount.projectId,
  sourceSessionId: mount.sessionId,
  sourceMountId: mount.id,
  repoRoot,
  worktreePath,
  branch: mount.branch,
  reason: 'session_delete',
  lastCheckedAt: now,
  createdAt: now,
  updatedAt: now,
});

type ResolveParams = {
  readonly projects: ReadonlyArray<Project>;
  readonly mount: SessionMount;
};

const resolveProject = ({ projects, mount }: ResolveParams): Project | undefined => {
  const byId = projects.find((candidate) => candidate.id === mount.projectId);
  if (byId !== undefined) {
    return byId;
  }
  return mount.projectId === null
    ? projects.find((candidate) => candidate.name === mount.mountName)
    : undefined;
};

export const deleteTask = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId) => {
    const session =
      get().sessions.find((s) => s.id === sessionId) ??
      Object.values(get().archivedSessions)
        .flat()
        .find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`session not found: ${sessionId}`);
    }
    await get()
      .closeSessionTerminals(sessionId)
      .catch(() => undefined);
    let runStopped = true;
    if (session.state.kind === 'running') {
      const runId = (session.state as { kind: 'running'; runId: ProviderRunId }).runId;
      await cancelTurn(runId).catch(() => undefined);
      runStopped = await awaitRunStopped(runId).catch(() => false);
    }
    const mounts = await listSessionMounts({ db: tauriDatabase, sessionId });
    const isBranchless = isBranchlessSession({
      branch: get().sessionBranches[sessionId],
    });
    const cleanupFailures: unknown[] = [];
    const retained: Array<RetainedWorktreePath> = [];
    const detached: Array<MountDetachment> = [];
    const nowIso = new Date().toISOString() as IsoDateTime;
    const projects = get().projects.filter(
      (project) => project.workspaceId === session.workspaceId,
    );
    for (const mount of mounts) {
      const worktreePath = mount.worktreePath;
      if (worktreePath === null) {
        continue;
      }
      const project = resolveProject({ projects, mount });
      const repoRoot = project?.rootPath ?? '';
      const keep = (error: unknown, diskState: MountDiskState) => {
        cleanupFailures.push(error);
        detached.push({ mountId: mount.id, diskState });
        retained.push(
          toRetained({
            mount,
            worktreePath,
            repoRoot,
            workspaceId: session.workspaceId,
            now: nowIso,
          }),
        );
      };
      if (project?.kind !== 'repo') {
        try {
          await removePersistedDirectory(worktreePath);
          detached.push({ mountId: mount.id, diskState: 'removed' });
        } catch (error) {
          keep(error, 'present');
        }
        continue;
      }
      if (!runStopped) {
        keep(new Error(`${worktreePath}: the agent did not stop`), 'present');
        continue;
      }
      const result = await cleanupMountDirectory({
        get,
        target: {
          sessionId,
          mountId: mount.id,
          projectId: mount.projectId,
          repoRoot,
          worktreePath,
          branch: mount.branch,
          diskState: mount.diskState,
          isRepoProject: true,
        },
      });
      if (result.decision.kind === 'kept' || result.decision.kind === 'failed') {
        keep(new Error(`${worktreePath}: ${result.decision.reason}`), result.diskState);
        continue;
      }
      detached.push({ mountId: mount.id, diskState: result.diskState });
      await tidyRepoGoodboyDir({ repoPath: repoRoot }).catch(() => undefined);
    }
    try {
      await scratchDirRemove({ sessionId });
    } catch {
      console.error(`scratch directory not removed: ${sessionId}`);
    }
    forgetMaterializationSeed({ sessionId });
    await detachSessionMounts({ db: tauriDatabase, sessionId, detached, retained });
    if (cleanupFailures.length > 0) {
      void get().emitNotification(
        'error',
        'warning',
        `failed to remove ${cleanupFailures.length} session paths`,
        cleanupFailures.map((error) => formatError(error)).join('\n'),
        { sessionId, workspaceId: session.workspaceId },
      );
    }
    if (isBranchless) {
      await purgeSessionFileVersions({ sessionId });
    }
    const sessionWorkspaceId = session.workspaceId;
    await purgeSessionForDelete({ db: tauriDatabase, id: sessionId });
    dropPendingTurnEvents({
      agentIds: (get().sessionPhaseRuns[sessionId] ?? []).map((agent) => agent.id),
    });
    get().evictSession({ sessionId, mode: 'delete' });
    set((state) => {
      const cachedArchived = state.archivedSessions[sessionWorkspaceId];
      const nextArchived = cachedArchived
        ? {
            ...state.archivedSessions,
            [sessionWorkspaceId]: cachedArchived.filter((s) => s.id !== sessionId),
          }
        : state.archivedSessions;
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        archivedSessions: nextArchived,
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
      };
    });
    void get()
      .reconcileOrphanWorktrees()
      .catch(() => undefined);
  };
};
