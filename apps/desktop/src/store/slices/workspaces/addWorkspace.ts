import type {
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { seedWorkflowLibrary } from '@goodboy/core';
import {
  findProjectByRootPath,
  getWorkspaceById,
  insertProject,
  insertWorkspace,
  reconnectProject,
  reconnectWorkspace,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import { validateGitRepo } from '../../../shared/lib/repo';
import { invokeWorkflowList } from '../../../features/workflows/workflows';
import { invokeSkillRescan } from '../../../features/skills/skills';
import { workspaceSlug } from './slug';
import type { GetFn, SetFn } from './types';

type Input = {
  readonly rootPath: string;
  readonly name?: string;
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

export const addWorkspace = (set: SetFn, get: GetFn) => {
  return async ({ rootPath, name }: Input): Promise<Workspace> => {
    const check = await validateGitRepo(rootPath);
    const isRepo = check.isRepo && check.rootPath != null && check.rootPath !== '';
    const resolvedRoot = isRepo ? check.rootPath : check.resolvedPath;
    if (resolvedRoot == null || resolvedRoot === '') {
      throw new Error(check.error ?? 'folder not found');
    }

    const existingProject = await findProjectByRootPath({
      db: tauriDatabase,
      rootPath: resolvedRoot,
    });
    if (existingProject != null) {
      if (existingProject.disconnectedAt === undefined) {
        const owner = get().workspaces.find(
          (workspace) => workspace.id === existingProject.workspaceId,
        );
        throw new Error(
          `${existingProject.name} is already linked in ${owner?.name ?? 'another workspace'}`,
        );
      }
      const now = new Date().toISOString() as IsoDateTime;
      await reconnectWorkspace({ db: tauriDatabase, id: existingProject.workspaceId, at: now });
      await reconnectProject({ db: tauriDatabase, id: existingProject.id, at: now });
      const workspace = await getWorkspaceById({
        db: tauriDatabase,
        id: existingProject.workspaceId,
      });
      if (workspace === null) {
        throw new Error(`workspace not found: ${existingProject.workspaceId}`);
      }
      const project: Project = {
        ...existingProject,
        updatedAt: now,
        lastAccessedAt: now,
      };
      set((state) => ({
        workspaces: [workspace, ...state.workspaces.filter((item) => item.id !== workspace.id)],
        projects: [project, ...state.projects.filter((item) => item.id !== project.id)],
      }));
      return workspace;
    }

    const inferredName =
      name?.trim() ||
      resolvedRoot
        .split('/')
        .filter((part) => part.length > 0)
        .at(-1) ||
      'workspace';
    const now = new Date().toISOString() as IsoDateTime;
    const workspaceId = crypto.randomUUID() as WorkspaceId;
    const workspace: Workspace = {
      id: workspaceId,
      name: inferredName,
      slug: workspaceSlug({ name: inferredName, id: workspaceId }),
      sessionsRoot: null,
      overrides: EMPTY_OVERRIDES,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
    const project: Project = {
      id: crypto.randomUUID() as ProjectId,
      workspaceId,
      name: inferredName,
      rootPath: resolvedRoot,
      kind: isRepo ? 'repo' : 'folder',
      overrides: EMPTY_OVERRIDES,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
    try {
      await insertWorkspace({ db: tauriDatabase, workspace });
      await insertProject({ db: tauriDatabase, project });
    } catch (error) {
      const message = formatError(error);
      if (message.toLowerCase().includes('unique')) {
        throw new Error(`workspace already exists at ${resolvedRoot}`);
      }
      throw new Error(`failed to register workspace: ${message}`);
    }
    set((state) => ({
      workspaces: [workspace, ...state.workspaces],
      projects: [project, ...state.projects],
    }));

    await seedWorkflowLibrary({ db: tauriDatabase }, workspace.id).catch(() => undefined);
    const templates = await invokeWorkflowList(workspace.id).catch(() => []);
    set((state) => ({ phaseTemplates: { ...state.phaseTemplates, [workspace.id]: templates } }));
    const skills = await invokeSkillRescan(workspace.id).catch(() => []);
    set((state) => ({ skills: { ...state.skills, [workspace.id]: skills } }));

    return workspace;
  };
};
