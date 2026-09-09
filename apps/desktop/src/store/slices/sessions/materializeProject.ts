import type { MountId, ProjectId, SessionId, SessionProjectMount } from '@goodboy/types';
import {
  insertSessionWorktree,
  listWorktreesForSession,
  updateSessionActiveProject,
  updateSessionWorktreeRepoSlug,
  type SessionWorktree,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import { detectRepoSlug, resolveSettings } from '@goodboy/core';
import { tauriDatabase } from '../../../shared/lib/db';
import { tauriGhRunner } from '../../../features/github/github';
import { createSessionDir, createWorktree } from '../../../features/worktree/worktree';
import { DEFAULT_BRANCH_PREFIX } from '../../../features/settings/settings';
import { consumeAdoptionSeed, materializationSeedFor } from './materializationSeeds';
import { branchInUseError } from '../project-mounts/mountErrors';
import { mountDirName } from '../project-mounts/mountDirName';
import { deriveBranchName } from './deriveBranchName';
import type { GetFn, SetFn } from './types';

export type MaterializeProjectInput = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly reason: string;
  readonly taskIdentifiers?: ReadonlyArray<string>;
};

type StampRepoSlugParams = {
  readonly sessionId: SessionId;
  readonly workspaceId: string;
  readonly repoRoot: string;
  readonly worktreePath: string;
  readonly projectId: ProjectId;
};

const stampRepoSlug = async ({
  sessionId,
  workspaceId,
  repoRoot,
  worktreePath,
  projectId,
}: StampRepoSlugParams): Promise<void> => {
  try {
    const slug = await detectRepoSlug(tauriGhRunner, repoRoot, workspaceId, projectId);
    if (slug == null) {
      return;
    }
    await updateSessionWorktreeRepoSlug({
      db: tauriDatabase,
      sessionId,
      worktreePath,
      repoSlug: slug,
    });
  } catch {
    return;
  }
};

const inFlight = new Map<string, Promise<SessionProjectMount>>();

type AppendRecordParams = {
  readonly current: Readonly<Record<string, ReadonlyArray<SessionWorktree>>> | undefined;
  readonly sessionId: SessionId;
  readonly record: SessionWorktree;
};

const withWorktreeRecord = ({
  current,
  sessionId,
  record,
}: AppendRecordParams): Readonly<Record<string, ReadonlyArray<SessionWorktree>>> => {
  const rows = current?.[sessionId] ?? [];
  if (rows.some((row) => row.id === record.id)) {
    return current ?? {};
  }
  return { ...current, [sessionId]: [...rows, record] };
};

export const materializeProject = (set: SetFn, get: GetFn) => {
  const run = async ({
    sessionId,
    projectId,
    reason,
    taskIdentifiers,
  }: MaterializeProjectInput): Promise<SessionProjectMount> => {
    const trimmedReason = reason.trim();
    if (trimmedReason === '') {
      throw new Error('materializing a project requires a reason');
    }
    const session =
      get().sessions.find((candidate) => candidate.id === sessionId) ??
      Object.values(get().archivedSessions)
        .flat()
        .find((candidate) => candidate.id === sessionId);
    if (session === undefined) {
      throw new Error(`session not found: ${sessionId}`);
    }
    const existingMount = (get().sessionProjectMounts[sessionId] ?? []).find(
      (mount) => mount.projectId === projectId,
    );
    if (existingMount !== undefined) {
      return existingMount;
    }
    const project = get().projects.find((candidate) => candidate.id === projectId);
    if (project === undefined || project.workspaceId !== session.workspaceId) {
      throw new Error(`project not found in this workspace: ${projectId}`);
    }
    const rows = await listWorktreesForSession(tauriDatabase, sessionId);
    const persistedRow = rows.find(
      (row) =>
        row.projectId === projectId ||
        (row.projectId === undefined && row.parallelIndex > 0 && row.mountName === project.name),
    );
    if (persistedRow !== undefined) {
      const persistedMount: SessionProjectMount = {
        mountId: persistedRow.id as MountId,
        sessionId,
        projectId,
        mountName: persistedRow.mountName ?? project.name,
        worktreePath: persistedRow.worktreePath,
        lastWorktreePath: persistedRow.worktreePath,
        repoRoot: project.rootPath,
        branch: persistedRow.branch,
        baseBranch: project.baseBranch ?? null,
        parallelIndex: persistedRow.parallelIndex,
        isAttached: true,
      };
      set((state) => ({
        sessionProjectMounts: {
          ...state.sessionProjectMounts,
          [sessionId]: [...(state.sessionProjectMounts[sessionId] ?? []), persistedMount],
        },
        sessionWorktreeRecords: withWorktreeRecord({
          current: state.sessionWorktreeRecords,
          sessionId,
          record: persistedRow,
        }),
      }));
      return persistedMount;
    }
    const seed = materializationSeedFor({ sessionId });
    const resolved = resolveSettings({
      global: {
        defaultProviderId: session.providerPreference.defaultProvider,
        defaultWorkflowId: null,
        defaultBranchPrefix: DEFAULT_BRANCH_PREFIX,
        parallelEnabled: false,
        defaultVerbosity: 'normal',
      },
      workspaceOverride: get().workspaceOverrides[session.workspaceId] ?? null,
      projectOverride: project.overrides,
    });
    const prefix = seed?.branchPrefix ?? resolved.defaultBranchPrefix;
    const liveSessionIds: ReadonlySet<string> = new Set(
      get()
        .sessions.filter(
          (candidate) =>
            candidate.workspaceId === session.workspaceId && candidate.id !== sessionId,
        )
        .map((candidate) => candidate.id),
    );
    const recordBranches = Object.entries(get().sessionWorktreeRecords ?? {}).flatMap(
      ([candidateId, records]) =>
        liveSessionIds.has(candidateId) ? records.map((record) => record.branch) : [],
    );
    const mountBranches = Object.entries(get().sessionProjectMounts).flatMap(
      ([candidateId, mounts]) =>
        liveSessionIds.has(candidateId) ? mounts.map((mount) => mount.branch) : [],
    );
    const storedIdentifiers = (get().sessionExternalTasks[sessionId] ?? []).map(
      (task) => task.identifier,
    );
    const sessionSlug = deriveBranchName({
      prefix,
      sessionId,
      goal: session.goal,
      ...(seed?.sessionSlug !== undefined ? { explicitSlug: seed.sessionSlug } : {}),
      taskIdentifiers: storedIdentifiers.length > 0 ? storedIdentifiers : taskIdentifiers,
      existingBranches: [...recordBranches, ...mountBranches],
    });
    const hasRepoMount = rows.some((row) => row.projectId !== undefined && row.branch !== '');
    const adoptedBranch = hasRepoMount ? undefined : seed?.existingBranch;
    const adoptedFallbackRef = adoptedBranch === undefined ? undefined : seed?.fallbackRef;
    const mountId = crypto.randomUUID() as MountId;
    let created;
    try {
      created =
        project.kind === 'repo'
          ? await createWorktree({
              repoPath: project.rootPath,
              branchPrefix: prefix,
              slug: sessionSlug,
              parentDir: `${project.rootPath}/.goodboy/worktrees`,
              dirName: mountDirName({ sessionSlug, mountId }),
              baseBranch: project.baseBranch ?? undefined,
              ...(adoptedBranch !== undefined ? { existingBranch: adoptedBranch } : {}),
              ...(adoptedFallbackRef !== undefined ? { fallbackRef: adoptedFallbackRef } : {}),
            })
          : await createSessionDir({
              basePath: project.rootPath,
              slug: sessionSlug,
              ...(seed?.folderName !== undefined ? { directoryName: seed.folderName } : {}),
              sessionId,
              workspaceId: session.workspaceId,
            });
    } catch (error) {
      await get().recordSessionEvent({
        sessionId,
        kind: 'project_materialization_refused',
        payload: { projectId, projectName: project.name, reason: formatError(error) },
      });
      const branchInUse = branchInUseError({ error });
      if (branchInUse !== null) {
        throw branchInUse;
      }
      throw error;
    }
    if (adoptedBranch !== undefined) {
      consumeAdoptionSeed({ sessionId });
    }
    const nextParallelIndex = rows.reduce((max, row) => Math.max(max, row.parallelIndex), 0) + 1;
    const record: SessionWorktree = {
      id: mountId,
      sessionId,
      worktreePath: created.worktreePath,
      branch: created.branchName,
      parallelIndex: nextParallelIndex,
      projectId,
      mountName: project.name,
      createdAt: Date.now(),
    };
    await insertSessionWorktree(tauriDatabase, record);
    const isFirstMount = (get().sessionProjectMounts[sessionId] ?? []).length === 0;
    const isFirstActiveProject =
      session.activeProjectId === undefined && get().sessionActiveProject[sessionId] === undefined;
    if (isFirstActiveProject) {
      await updateSessionActiveProject({ db: tauriDatabase, id: sessionId, projectId }).catch(
        () => undefined,
      );
    }
    await get().recordSessionEvent({
      sessionId,
      kind: 'project_materialized',
      payload: {
        projectId,
        projectName: project.name,
        branch: created.branchName,
        reason: trimmedReason,
      },
    });
    const mount: SessionProjectMount = {
      mountId,
      sessionId,
      projectId,
      mountName: project.name,
      worktreePath: created.worktreePath,
      lastWorktreePath: created.worktreePath,
      repoRoot: project.rootPath,
      branch: created.branchName,
      baseBranch: project.baseBranch ?? null,
      parallelIndex: nextParallelIndex,
      isAttached: true,
      diskState: 'present',
      revision: 0,
    };
    set((state) => ({
      sessionProjectMounts: {
        ...state.sessionProjectMounts,
        [sessionId]: [...(state.sessionProjectMounts[sessionId] ?? []), mount],
      },
      sessionWorktrees: {
        ...state.sessionWorktrees,
        [sessionId]: [...(state.sessionWorktrees[sessionId] ?? []), created.worktreePath],
      },
      sessionWorktreeRecords: withWorktreeRecord({
        current: state.sessionWorktreeRecords,
        sessionId,
        record,
      }),
      ...(isFirstMount
        ? {
            sessionBranches: { ...state.sessionBranches, [sessionId]: created.branchName },
            sessionActiveMount: { ...state.sessionActiveMount, [sessionId]: mountId },
          }
        : {}),
      ...(isFirstActiveProject
        ? {
            sessionActiveProject: { ...state.sessionActiveProject, [sessionId]: projectId },
            sessions: state.sessions.map((candidate) =>
              candidate.id === sessionId ? { ...candidate, activeProjectId: projectId } : candidate,
            ),
          }
        : {}),
    }));
    if (project.kind === 'repo') {
      void stampRepoSlug({
        sessionId,
        workspaceId: session.workspaceId,
        repoRoot: project.rootPath,
        worktreePath: created.worktreePath,
        projectId,
      });
    }
    return mount;
  };
  return async (input: MaterializeProjectInput): Promise<SessionProjectMount> => {
    const key = `${input.sessionId}:${input.projectId}`;
    const pending = inFlight.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const promise = run(input).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  };
};
