import type {
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import {
  describeProjectAdoption,
  findProjectByRootPath,
  insertProject,
  reconnectProject,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { validateGitRepo } from '../../../shared/lib/repo';
import type { GetFn, SetFn } from './types';

export type ProjectAttachConflict = {
  readonly project: Project;
  readonly sourceWorkspace: Workspace;
  readonly sessionCount: number;
  readonly isShell: boolean;
};

export type AddProjectResult =
  | { readonly kind: 'linked'; readonly project: Project }
  | { readonly kind: 'conflict'; readonly conflict: ProjectAttachConflict };

type Input = {
  readonly workspaceId: WorkspaceId;
  readonly rootPath: string;
  readonly name?: string;
  readonly requireRepo?: boolean;
};

const EMPTY_OVERRIDES: OverrideSettings = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

type BuildConflictParams = {
  readonly get: GetFn;
  readonly project: Project;
};

export const buildAttachConflict = async ({
  get,
  project,
}: BuildConflictParams): Promise<ProjectAttachConflict> => {
  const sourceWorkspace = get().workspaces.find(
    (workspace) => workspace.id === project.workspaceId,
  );
  if (sourceWorkspace === undefined) {
    throw new Error(`workspace not found: ${project.workspaceId}`);
  }
  const info = await describeProjectAdoption({ db: tauriDatabase, projectId: project.id });
  return {
    project,
    sourceWorkspace,
    sessionCount: info?.sessionCount ?? 0,
    isShell: info?.isShell ?? false,
  };
};

export const addProject = (set: SetFn, get: GetFn) => {
  return async ({
    workspaceId,
    rootPath,
    name,
    requireRepo = false,
  }: Input): Promise<AddProjectResult> => {
    if (get().workspaces.every((workspace) => workspace.id !== workspaceId)) {
      throw new Error(`workspace not found: ${workspaceId}`);
    }
    const check = await validateGitRepo(rootPath);
    const isRepo = check.isRepo && check.rootPath != null && check.rootPath !== '';
    if (requireRepo && !isRepo) {
      throw new Error(
        `no git repository at ${rootPath}. pick a folder with a .git directory, or use New project to initialize one`,
      );
    }
    const resolvedRoot = isRepo ? check.rootPath : check.resolvedPath;
    if (resolvedRoot == null || resolvedRoot === '') {
      throw new Error(check.error ?? 'folder not found');
    }
    const existing = await findProjectByRootPath({ db: tauriDatabase, rootPath: resolvedRoot });
    if (existing !== null) {
      if (existing.workspaceId !== workspaceId) {
        const conflict = await buildAttachConflict({ get, project: existing });
        return { kind: 'conflict', conflict };
      }
      if (existing.disconnectedAt !== undefined) {
        const at = new Date().toISOString() as IsoDateTime;
        await reconnectProject({ db: tauriDatabase, id: existing.id, at });
        const reconnected: Project = {
          ...existing,
          updatedAt: at,
          lastAccessedAt: at,
          disconnectedAt: undefined,
        };
        set((state) => ({
          projects: [
            ...state.projects.filter((project) => project.id !== existing.id),
            reconnected,
          ],
        }));
        return { kind: 'linked', project: reconnected };
      }
      throw new Error(`${existing.name} is already linked to this workspace`);
    }
    const projectName =
      name?.trim() ||
      resolvedRoot
        .split('/')
        .filter((part) => part.length > 0)
        .at(-1) ||
      'project';
    const now = new Date().toISOString() as IsoDateTime;
    const project: Project = {
      id: crypto.randomUUID() as ProjectId,
      workspaceId,
      name: projectName,
      rootPath: resolvedRoot,
      kind: isRepo ? 'repo' : 'folder',
      baseBranch: null,
      overrides: EMPTY_OVERRIDES,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
    await insertProject({ db: tauriDatabase, project });
    set((state) => ({ projects: [...state.projects, project] }));
    return { kind: 'linked', project };
  };
};
